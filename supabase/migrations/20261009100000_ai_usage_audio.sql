-- La voix au guichet IA — deux natures d'appel de plus, un seau de cadence de plus.
--
-- POURQUOI. Le mode dialogue de l'assistant du portail usagers (plan du
-- 2026-10-09) fait transcrire la voix de l'usager et prononcer les réponses,
-- par `ai-api` : `POST /v1/transcriptions` et `POST /v1/speech`. Elles passent
-- par LA porte existante (`reserve_ai_usage` / `settle_ai_usage`) — une
-- collectivité a un crédit, pas trois. Secondes et caractères sont convertis
-- en jetons dans `ai-api/_shared/audio.ts` ; la base ne voit que des jetons.
--
-- CE QUI CHANGE, et rien d'autre :
--   1. `ai_usage_events.resource_type` (et son archive) accepte `transcription`
--      et `speech` — deux énumérés courts : le passe-plat tient (Q9 inchangé,
--      aucune colonne ajoutée).
--   2. `ai_usage_rate.bucket` accepte `audio`, un seau SÉPARÉ : un dialogue
--      vocal fait trois appels par tour (transcription, réponse, synthèse) ;
--      dans le seau conversationnel, la voix mangerait le budget de questions
--      de la même conversation.
--   3. `reserve_ai_usage` range ces deux natures dans le seau `audio`, seuils
--      40 / minute par acteur, 240 sans acteur. Le reste du corps est celui de
--      `ai_usage_partage_chiffres_appelant`, à l'identique. Type inconnu ⇒
--      toujours le seuil conversationnel, le plus strict.

alter table public.ai_usage_events
  drop constraint ai_usage_events_resource_type_check,
  add constraint ai_usage_events_resource_type_check
    check (resource_type in ('chat', 'agent', 'ocr', 'transcription', 'speech'));

alter table public.ai_usage_events_archive
  drop constraint ai_usage_events_resource_type_check,
  add constraint ai_usage_events_resource_type_check
    check (resource_type in ('chat', 'agent', 'ocr', 'transcription', 'speech'));

alter table public.ai_usage_rate
  drop constraint ai_usage_rate_bucket_check,
  add constraint ai_usage_rate_bucket_check
    check (bucket in ('chat', 'batch', 'audio'));

comment on column public.ai_usage_rate.bucket is
  'Nature de l''appel, derivee cote serveur de p_resource_type : chat (conversationnel), batch (OCR), audio (transcription, synthese). Compteurs separes.';

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
  -- paramètre commercial. Voir `ai_usage_rate_par_type`.
  c_actor_chat     constant int := 20;
  c_actor_batch    constant int := 60;
  c_consumer_chat  constant int := 120;
  c_consumer_batch constant int := 360;
  -- La voix d'un dialogue : une transcription et une synthèse par tour, à
  -- cadence humaine — deux fois le seuil conversationnel, pas celui d'un lot.
  c_actor_audio    constant int := 40;
  c_consumer_audio constant int := 240;

  -- Type inconnu ⇒ seau conversationnel, le plus strict (R11e).
  v_bucket    text := case coalesce(p_resource_type, '')
                        when 'ocr'           then 'batch'
                        when 'transcription' then 'audio'
                        when 'speech'        then 'audio'
                        else 'chat' end;
  v_kind      text;
  v_subject   text;
  v_max       int;
  v_window    timestamptz := date_trunc('minute', now());

  v_period    text := to_char((now() at time zone 'utc'), 'YYYY-MM');
  v_renews    date := (date_trunc('month', (now() at time zone 'utc')) + interval '1 month')::date;
  v_estimate  bigint := greatest(coalesce(p_estimated_tokens, 0), 0);
  v_consumer  text := btrim(coalesce(p_consumer, ''));
  v_quota     public.ai_usage_quotas%rowtype;
  v_limit     bigint;               -- plafond commun actif, ou NULL
  v_cquota    public.ai_usage_consumer_quotas%rowtype;
  v_share     bigint;               -- part effective de l'appelant, ou NULL
  v_counted   boolean := false;
  v_event     uuid;
  v_rows      int;
  v_used      bigint;
  v_reserved  bigint;
  v_own_used     bigint := 0;       -- sous-compteur de l'appelant, après réservation
  v_own_reserved bigint := 0;
  v_others_reserve  bigint := 0;    -- ce que les AUTRES parts n'ont pas encore consommé
  v_others_used     bigint := 0;
  v_others_reserved bigint := 0;
  v_bound     bigint;               -- la borne appliquée au compteur commun
  v_caller_limit bigint;            -- le plafond DE L'APPELANT : commun moins les parts
begin
  if v_consumer = '' then
    raise exception 'Consommateur manquant : la depense doit etre imputable.' using errcode = '22023';
  end if;

  -- ── PORTE 1 : LE DÉBIT (tentatives, refus compris) ─────────────────────
  if p_external_actor_id is not null then
    v_kind := 'actor';
    v_subject := p_external_actor_id::text;
    v_max := case v_bucket when 'batch' then c_actor_batch
                           when 'audio' then c_actor_audio
                           else c_actor_chat end;
  else
    v_kind := 'consumer';
    v_subject := v_consumer;
    v_max := case v_bucket when 'batch' then c_consumer_batch
                           when 'audio' then c_consumer_audio
                           else c_consumer_chat end;
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
    return query select null::uuid, false, 'rate_limited'::text,
                        null::bigint, null::bigint, null::bigint, v_period, v_renews;
    return;
  end if;

  -- Le plafond commun se lit AVANT la porte 2 : une part en pourcentage se
  -- résout contre lui. Un plafond spécifique au fournisseur l'emporte.
  select q.* into v_quota
    from public.ai_usage_quotas q
   where q.organization_id = p_org_id
     and q.provider in (p_provider, '__global__')
     and q.is_active
   order by (q.provider = p_provider) desc
   limit 1;
  v_limit := case when v_quota.id is null then null else v_quota.monthly_limit_tokens end;

  -- ── PORTE 2 : LA PART DE L'APPLICATION (si elle en a une) ──────────────
  -- Le plus étroit d'abord. Même mécanique que le plafond : UN update
  -- conditionnel, 0 ligne ⇒ refus sans incrément, fournisseur jamais appelé.
  -- ⚠️ Part en pourcentage sans plafond commun ⇒ irrésoluble ⇒ porte SAUTÉE
  -- (`v_counted` reste faux) : un réglage sans base n'est pas une borne.
  select q.* into v_cquota
    from public.ai_usage_consumer_quotas q
   where q.organization_id = p_org_id
     and q.consumer        = v_consumer
     and q.is_active;

  if v_cquota.id is not null then
    v_share := public.ai_usage_share_effective(
      v_cquota.limit_mode, v_cquota.monthly_limit_tokens, v_cquota.limit_percent, v_limit);
  end if;

  if v_share is not null then
    insert into public.ai_usage_consumer_counters (organization_id, consumer, period)
         values (p_org_id, v_consumer, v_period)
    on conflict (organization_id, consumer, period) do nothing;

    update public.ai_usage_consumer_counters c
       set reserved_tokens = c.reserved_tokens + v_estimate,
           updated_at      = now()
     where c.organization_id = p_org_id
       and c.consumer        = v_consumer
       and c.period          = v_period
       and (c.used_tokens + c.reserved_tokens + v_estimate) <= v_share;
    get diagnostics v_rows = row_count;

    select c.used_tokens, c.reserved_tokens into v_own_used, v_own_reserved
      from public.ai_usage_consumer_counters c
     where c.organization_id = p_org_id
       and c.consumer        = v_consumer
       and c.period          = v_period;

    if v_rows = 0 then
      -- Les chiffres rendus sont ceux de la PART : c'est elle qui refuse.
      return query select null::uuid, false, 'consumer_quota_exceeded'::text,
                          v_share, v_own_used, v_own_reserved, v_period, v_renews;
      return;
    end if;
    v_counted := true;
  end if;

  -- ── PORTE 3 : LE PLAFOND DE LA COLLECTIVITÉ, MOINS CE QUI EST RÉSERVÉ ──
  -- Aucun plafond ⇒ ILLIMITÉ pour la collectivité — la part, elle, a déjà
  -- borné l'application.
  if v_quota.id is null then
    insert into public.ai_usage_events (
      organization_id, provider, counter_provider, consumer, api_key_id, feature,
      resource_type, status, estimated_tokens, period,
      external_ref_kind, external_ref_id, external_actor_id, consumer_counted
    ) values (
      p_org_id, p_provider, null, p_consumer, p_api_key_id, p_feature,
      p_resource_type, 'reserved', v_estimate, v_period,
      p_external_ref_kind, p_external_ref_id, p_external_actor_id, v_counted
    ) returning id into v_event;
    return query select v_event, true, 'no_quota_configured'::text,
                        null::bigint, null::bigint, null::bigint, v_period, v_renews;
    return;
  end if;

  insert into public.ai_usage_counters (organization_id, provider, period)
       values (p_org_id, v_quota.provider, v_period)
  on conflict (organization_id, provider, period) do nothing;

  -- ⚠️ VERROU D'ABORD, LECTURE ENSUITE. Toute modification de l'engagé commun
  -- par une part (réservation, règlement, rendu) passe par ce verrou de
  -- ligne : une fois pris, la lecture des sous-compteurs ci-dessous voit
  -- l'état réglé — une réservation concurrente non validée n'est pas vue, et
  -- la borne calculée est alors plus BASSE, jamais plus haute. Ordre des
  -- verrous sans cycle : une part prend SON sous-compteur puis le commun ;
  -- un appelant sans part prend le commun puis lit (sans verrou).
  perform 1
     from public.ai_usage_counters c
    where c.organization_id = p_org_id
      and c.provider        = v_quota.provider
      and c.period          = v_period
      for update;

  -- Ce que les AUTRES parts actives n'ont pas encore consommé de leur
  -- réserve, et ce qu'elles ont engagé (pour rendre à l'appelant SES chiffres).
  -- ⚠️ Pas d'agrégat dans le WHERE de l'UPDATE : après une attente de verrou,
  -- Postgres ré-évalue le prédicat avec le snapshot d'origine pour les autres
  -- tables — la borne serait périmée sans qu'on le voie.
  select coalesce(sum(greatest(
           public.ai_usage_share_effective(
             q.limit_mode, q.monthly_limit_tokens, q.limit_percent, v_quota.monthly_limit_tokens)
           - coalesce(c.used_tokens, 0) - coalesce(c.reserved_tokens, 0), 0)), 0),
         coalesce(sum(coalesce(c.used_tokens, 0)), 0),
         coalesce(sum(coalesce(c.reserved_tokens, 0)), 0)
    into v_others_reserve, v_others_used, v_others_reserved
    from public.ai_usage_consumer_quotas q
    left join public.ai_usage_consumer_counters c
      on c.organization_id = q.organization_id
     and c.consumer        = q.consumer
     and c.period          = v_period
   where q.organization_id = p_org_id
     and q.is_active
     and q.consumer <> v_consumer;

  -- Jamais négative : n parts peuvent, ensemble, dépasser le plafond.
  v_bound := greatest(v_quota.monthly_limit_tokens - v_others_reserve, 0);
  -- ⚠️ La BORNE s'applique au compteur COMMUN (qui contient les parts) ; le
  -- PLAFOND DE L'APPELANT, lui, est le commun moins les parts — stable dans
  -- le mois, c'est lui qu'on rend : « used / limit » lu par une application
  -- doit être cohérent avec son propre engagé. Identité :
  --   P − Σ greatest(X_o − U_o, 0) − Σ U_o = P − Σ greatest(X_o, U_o).
  v_caller_limit := greatest(v_bound - v_others_used - v_others_reserved, 0);

  update public.ai_usage_counters c
     set reserved_tokens = c.reserved_tokens + v_estimate,
         updated_at      = now()
   where c.organization_id = p_org_id
     and c.provider        = v_quota.provider
     and c.period          = v_period
     and (c.used_tokens + c.reserved_tokens + v_estimate) <= v_bound;
  get diagnostics v_rows = row_count;

  select c.used_tokens, c.reserved_tokens into v_used, v_reserved
    from public.ai_usage_counters c
   where c.organization_id = p_org_id
     and c.provider        = v_quota.provider
     and c.period          = v_period;

  if v_rows = 0 then
    -- ⚠️ Le sous-compteur a déjà réservé : on lui REND sa réservation avant de
    -- refuser. Sans cela, chaque refus du plafond commun rongerait la part
    -- d'une application qui n'a rien consommé.
    if v_counted then
      update public.ai_usage_consumer_counters c
         set reserved_tokens = greatest(c.reserved_tokens - v_estimate, 0),
             updated_at      = now()
       where c.organization_id = p_org_id
         and c.consumer        = v_consumer
         and c.period          = v_period;
    end if;
    -- Les chiffres rendus sont ceux de L'APPELANT : SON plafond (le commun
    -- moins les parts), et l'engagé commun moins celui des parts.
    return query select null::uuid, false, 'quota_exceeded'::text,
                        v_caller_limit,
                        greatest(v_used - v_others_used, 0),
                        greatest(v_reserved - v_others_reserved, 0),
                        v_period, v_renews;
    return;
  end if;

  insert into public.ai_usage_events (
    organization_id, provider, counter_provider, consumer, api_key_id, feature,
    resource_type, status, estimated_tokens, period,
    external_ref_kind, external_ref_id, external_actor_id, consumer_counted
  ) values (
    p_org_id, p_provider, v_quota.provider, p_consumer, p_api_key_id, p_feature,
    p_resource_type, 'reserved', v_estimate, v_period,
    p_external_ref_kind, p_external_ref_id, p_external_actor_id, v_counted
  ) returning id into v_event;

  -- Passant : SON plafond — sa part quand il en a une, sinon sa borne.
  if v_counted then
    return query select v_event, true, 'ok'::text,
                        v_share, v_own_used, v_own_reserved, v_period, v_renews;
  else
    return query select v_event, true, 'ok'::text,
                        v_caller_limit,
                        greatest(v_used - v_others_used, 0),
                        greatest(v_reserved - v_others_reserved, 0),
                        v_period, v_renews;
  end if;
end $fn$;

alter function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  owner to postgres;
-- ⚠️ Le `CREATE OR REPLACE` re-grante PUBLIC : REVOKE à re-poser ici.
revoke execute on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  to service_role;
