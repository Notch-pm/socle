-- Garde-fou de débit : un seuil par NATURE d'appel, et des seaux séparés.
--
-- ⚠️ CE QUE LA PREMIÈRE VERSION AVAIT MANQUÉ. Le seuil de 20 appels/minute a
-- été calibré sur un humain qui pose des questions — « il attend 10 à 15 s une
-- réponse puis lit 150 mots ». L'OCR n'a rien d'un rythme humain : c'est du
-- traitement de LOT, cadencé par la machine. Avec un document par appel
-- (`MAX_OCR_PAGES` = 100), 20 appels/minute veut dire 20 documents/minute par
-- agent — et un lot de courrier légitime se ferait couper, avec un refus qui
-- ressemblerait à une panne.
--
-- ⚠️ DEUX SEAUX, PAS SEULEMENT DEUX SEUILS. Différencier la limite sans
-- séparer le compteur laisserait un lot de courrier consommer le budget de
-- QUESTIONS du même agent : après vingt documents lus, sa question suivante
-- serait refusée alors qu'il n'en a posé aucune. Le `bucket` entre donc dans
-- la clé primaire. Une boucle reste attrapée dans les deux cas — une boucle
-- est d'un seul type.
--
-- ⚠️ `p_resource_type` EST DIGNE DE CONFIANCE, contrairement à `p_feature`.
-- Il est dérivé côté serveur par `ai-api` (`'ocr'` sur la route OCR,
-- `'agent'`/`'chat'` selon l'alias résolu), jamais lu dans le corps de la
-- requête : un appelant ne peut pas se déclarer « lot » pour obtenir la
-- limite haute.
--
-- ⚠️ TOUT TYPE INCONNU RETOMBE SUR LE SEUIL CONVERSATIONNEL, le plus strict.
-- Sur un garde-fou de coût, l'inconnu doit être bridé, pas laissé libre : la
-- personne qui ajoutera un type devra y penser explicitement.

alter table public.ai_usage_rate
  add column if not exists bucket text not null default 'chat'
  check (bucket in ('chat', 'batch'));

comment on column public.ai_usage_rate.bucket is
  'Nature de l''appel : ''chat'' (conversationnel, cadence humaine) ou ''batch'' (lot machine, OCR). Dans la CLÉ, pour que les deux ne se volent pas leur budget.';

-- Les lignes existantes deviennent 'chat' par le défaut. Elles sont éphémères
-- (purgées à l'heure) : il n'y a rien à reprendre.
alter table public.ai_usage_rate drop constraint if exists ai_usage_rate_pkey;
alter table public.ai_usage_rate
  add constraint ai_usage_rate_pkey
  primary key (organization_id, subject_kind, subject, bucket, window_start);

create or replace function public.reserve_ai_usage(
  p_org_id            uuid,
  p_provider          text,
  p_resource_type     text,
  p_estimated_tokens  bigint,
  p_consumer          text,
  p_api_key_id        uuid default null,
  p_feature           text default null,
  p_external_ref_kind text default null,
  p_external_ref_id   uuid default null,
  p_external_actor_id uuid default null
) returns table (
  event_id        uuid,
  allowed         boolean,
  reason          text,
  limit_tokens    bigint,
  used_tokens     bigint,
  reserved_tokens bigint,
  usage_period    text,
  renews_at       date
)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  -- ⚠️ SEUILS EN DUR (décision PO) : un garde-fou de sécurité n'est pas un
  -- paramètre commercial. Le rendre réglable, c'est le voir relevé le jour où
  -- il gêne — or il ne gêne que les boucles.
  --
  -- CONVERSATIONNEL : un agent attend 10-15 s une réponse puis lit 150 mots.
  -- Quatre questions/minute est déjà soutenu ; 20 laisse la place aux rafales
  -- et aux réessais, et coupe une boucle en moins d'une seconde.
  c_actor_chat     constant int := 20;
  -- LOT : un document par appel, à un rythme de machine. 60/minute (un par
  -- seconde) laisse passer un lot de courrier réel tout en arrêtant une boucle
  -- en une poignée de secondes — une boucle emballée fait des CENTAINES
  -- d'appels par seconde, l'ordre de grandeur n'est pas le même.
  c_actor_batch    constant int := 60;
  -- Filet des appelants qui n'identifient AUCUN agent : il couvre alors toute
  -- une collectivité, d'où le facteur 6 sur les deux natures.
  c_consumer_chat  constant int := 120;
  c_consumer_batch constant int := 360;

  v_bucket    text := case when coalesce(p_resource_type, '') = 'ocr' then 'batch' else 'chat' end;
  v_kind      text;
  v_subject   text;
  v_max       int;
  -- Un INSTANT tronqué à la minute, jamais un `timestamp` recalé par le fuseau
  -- de session (voir 20260829122457).
  v_window    timestamptz := date_trunc('minute', now());

  v_period    text := to_char((now() at time zone 'utc'), 'YYYY-MM');
  v_renews    date := (date_trunc('month', (now() at time zone 'utc')) + interval '1 month')::date;
  v_estimate  bigint := greatest(coalesce(p_estimated_tokens, 0), 0);
  v_quota     public.ai_usage_quotas%rowtype;
  v_event     uuid;
  v_rows      int;
  v_used      bigint;
  v_reserved  bigint;
begin
  if coalesce(btrim(p_consumer), '') = '' then
    raise exception 'Consommateur manquant : la depense doit etre imputable.' using errcode = '22023';
  end if;

  -- ── PORTE 1 : LE DÉBIT (tentatives, refus compris) ─────────────────────
  -- Sujets ALTERNATIFS, jamais cumulés : les cumuler obligerait à fixer la
  -- limite « application » au-dessus de la population d'agents d'une grande
  -- collectivité, ce qui la rendrait inopérante.
  if p_external_actor_id is not null then
    v_kind := 'actor';
    v_subject := p_external_actor_id::text;
    v_max := case when v_bucket = 'batch' then c_actor_batch else c_actor_chat end;
  else
    v_kind := 'consumer';
    v_subject := btrim(p_consumer);
    v_max := case when v_bucket = 'batch' then c_consumer_batch else c_consumer_chat end;
  end if;

  insert into public.ai_usage_rate (organization_id, subject_kind, subject, bucket, window_start)
       values (p_org_id, v_kind, v_subject, v_bucket, v_window)
  on conflict (organization_id, subject_kind, subject, bucket, window_start) do nothing;

  update public.ai_usage_rate r
     set attempts = r.attempts + 1
   where r.organization_id = p_org_id
     and r.subject_kind    = v_kind
     and r.subject         = v_subject
     and r.bucket          = v_bucket
     and r.window_start    = v_window
     and r.attempts + 1   <= v_max;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    -- Refus de cadence. AUCUNE ligne de journal, comme pour un refus de
    -- plafond. Compteurs de jetons à NULL : les remplir laisserait croire que
    -- le crédit est en cause.
    return query select null::uuid, false, 'rate_limited'::text,
                        null::bigint, null::bigint, null::bigint, v_period, v_renews;
    return;
  end if;

  -- ── PORTE 2 : LE PLAFOND ───────────────────────────────────────────────
  select q.* into v_quota
    from public.ai_usage_quotas q
   where q.organization_id = p_org_id
     and q.provider in (p_provider, '__global__')
     and q.is_active
   order by (q.provider = p_provider) desc
   limit 1;

  -- Aucun plafond ⇒ ILLIMITÉ. ⚠️ Ce `return` anticipé est la raison pour
  -- laquelle la porte de débit est placée AVANT.
  if v_quota.id is null then
    insert into public.ai_usage_events (
      organization_id, provider, counter_provider, consumer, api_key_id, feature,
      resource_type, status, estimated_tokens, period,
      external_ref_kind, external_ref_id, external_actor_id
    ) values (
      p_org_id, p_provider, null, p_consumer, p_api_key_id, p_feature,
      p_resource_type, 'reserved', v_estimate, v_period,
      p_external_ref_kind, p_external_ref_id, p_external_actor_id
    ) returning id into v_event;
    return query select v_event, true, 'no_quota_configured'::text,
                        null::bigint, null::bigint, null::bigint, v_period, v_renews;
    return;
  end if;

  insert into public.ai_usage_counters (organization_id, provider, period)
       values (p_org_id, v_quota.provider, v_period)
  on conflict (organization_id, provider, period) do nothing;

  update public.ai_usage_counters c
     set reserved_tokens = c.reserved_tokens + v_estimate,
         updated_at      = now()
   where c.organization_id = p_org_id
     and c.provider        = v_quota.provider
     and c.period          = v_period
     and (c.used_tokens + c.reserved_tokens + v_estimate) <= v_quota.monthly_limit_tokens;
  get diagnostics v_rows = row_count;

  select c.used_tokens, c.reserved_tokens into v_used, v_reserved
    from public.ai_usage_counters c
   where c.organization_id = p_org_id
     and c.provider        = v_quota.provider
     and c.period          = v_period;

  if v_rows = 0 then
    return query select null::uuid, false, 'quota_exceeded'::text,
                        v_quota.monthly_limit_tokens, v_used, v_reserved, v_period, v_renews;
    return;
  end if;

  insert into public.ai_usage_events (
    organization_id, provider, counter_provider, consumer, api_key_id, feature,
    resource_type, status, estimated_tokens, period,
    external_ref_kind, external_ref_id, external_actor_id
  ) values (
    p_org_id, p_provider, v_quota.provider, p_consumer, p_api_key_id, p_feature,
    p_resource_type, 'reserved', v_estimate, v_period,
    p_external_ref_kind, p_external_ref_id, p_external_actor_id
  ) returning id into v_event;

  return query select v_event, true, 'ok'::text,
                      v_quota.monthly_limit_tokens, v_used, v_reserved, v_period, v_renews;
end $fn$;

alter function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  owner to postgres;
comment on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid) is
  'Réserve des jetons AVANT l''appel fournisseur. DEUX portes : le DÉBIT (tentatives par minute, par agent ET par nature d''appel — conversationnel ou lot) puis le PLAFOND mensuel. Chacune est UN update conditionnel = la sérialisation. Aucun plafond ⇒ illimité, mais le débit s''applique quand même.';

-- ⚠️ Le `CREATE OR REPLACE` re-grante PUBLIC : REVOKE à re-poser ici.
revoke execute on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  to service_role;
