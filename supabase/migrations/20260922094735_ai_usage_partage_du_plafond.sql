-- Partage du plafond IA — la part RÉSERVÉE d'une application, en jetons ou en
-- pourcentage du plafond, et le reste aux autres.
--
-- POURQUOI (décision PO du 2026-09-22). Le sous-plafond du 2026-09-20 disait
-- « Nora, pas plus de N jetons » — mais il ne RÉSERVAIT rien : les agents
-- (Iris, Clara, Socle) pouvaient consommer tout le plafond, assistant compris,
-- et l'assistant s'effaçait alors sans avoir touché à sa borne. Le partage
-- dit : « l'assistant dispose de X, les agents du reste », et chacun est
-- borné à sa part. X se règle en jetons, ou en POURCENTAGE VIVANT du plafond :
-- relever le plafond fait suivre la part, sans ressaisie.
--
-- ⚠️ RÈGLE UNIFORME, SANS NOTION D'AUDIENCE. Un sous-plafond actif est une
-- part RÉSERVÉE à son application ; les applications sans part se partagent
-- le reste. Avec la seule part existante (nora), c'est exactement
-- usagers / agents — et la règle vaut pour n applications. Pas de colonne
-- « audience » : elle dirait la même chose avec un mot de plus.
--
-- La porte 3 (plafond commun) d'un appelant devient :
--   borne = greatest(P − Σ_{autres parts actives} greatest(X_eff − engagé, 0), 0)
-- Ce qu'une application n'a pas encore consommé de sa part lui reste réservé
-- jusqu'au renouvellement ; ce qu'elle a consommé n'est plus à réserver.
--
-- ⚠️ LE RÉGLAGE GOUVERNE L'USAGE, PAS LA DONNÉE, jusque dans les cas limites.
-- La RPC ne refuse que les invalidités INTRINSÈQUES (deux valeurs ou aucune,
-- pourcentage hors 1..99, jetons ≤ 0). Un pourcentage sans plafond commun est
-- ACCEPTÉ — sans effet tant qu'il n'y a pas de plafond (la porte est sautée) ;
-- une part en jetons plus grande que le plafond est ACCEPTÉE — bornée au
-- plafond à la lecture (`least`). Refuser à la pose ne serait pas un invariant :
-- `set_ai_usage_quota` peut abaisser ou désactiver le plafond après coup.
-- L'écran avertit ; la base reste inoffensive.
--
-- ⚠️ UNE SEULE IMPLÉMENTATION de la résolution d'une part :
-- `ai_usage_share_effective`, lue par la réservation ET par `ai_usage_shares`
-- (l'écran du Socle et `GET /v1/usage` de l'edge function). Le plancher
-- entier `(P × pct) / 100` est celui du bigint — le front l'imite (Math.floor).

-- 1. La part : en jetons OU en pourcentage — jamais les deux, jamais aucun.
alter table public.ai_usage_consumer_quotas
  drop constraint ai_usage_consumer_quotas_monthly_limit_tokens_check;
alter table public.ai_usage_consumer_quotas
  alter column monthly_limit_tokens drop not null;
alter table public.ai_usage_consumer_quotas
  add column limit_mode    text     not null default 'tokens'
    constraint ai_usage_consumer_quotas_limit_mode_check check (limit_mode in ('tokens', 'percent')),
  add column limit_percent smallint;
alter table public.ai_usage_consumer_quotas
  add constraint ai_usage_consumer_quotas_limit_shape check (
    (limit_mode = 'tokens'  and monthly_limit_tokens > 0 and limit_percent is null)
    or
    (limit_mode = 'percent' and limit_percent between 1 and 99 and monthly_limit_tokens is null)
  );

comment on table public.ai_usage_consumer_quotas is
  'Part du plafond IA RESERVEE a une application pour une collectivite (racine), en jetons ou en pourcentage vivant du plafond commun. Les applications sans part se partagent le reste. Aucune ligne active = aucune part. Ecriture par les RPC set_/delete_ai_usage_consumer_quota (super admin).';
comment on column public.ai_usage_consumer_quotas.limit_mode is
  'tokens : monthly_limit_tokens fait foi (borne au plafond commun a la lecture). percent : limit_percent du plafond commun ACTIF, resolu a chaque appel ; sans plafond, la part est sans effet.';
comment on column public.ai_usage_consumer_quotas.limit_percent is
  'Pourcentage du plafond commun, 1 a 99 — 100 ne laisserait rien aux autres. Plancher entier a la resolution.';
comment on column public.ai_usage_consumer_quotas.monthly_limit_tokens is
  'Part en jetons (mode tokens). Bornee au plafond commun a la lecture, jamais refusee a la pose : le plafond peut changer apres.';

-- 2. LA résolution d'une part — une implémentation, trois lecteurs.
create or replace function public.ai_usage_share_effective(
  p_mode    text,
  p_tokens  bigint,
  p_percent smallint,
  p_quota   bigint
) returns bigint
language sql
immutable
as $fn$
  select case
    when p_mode = 'percent' then
      case when p_quota is null then null else (p_quota * p_percent) / 100 end
    else
      case when p_quota is null then p_tokens else least(p_tokens, p_quota) end
  end;
$fn$;

comment on function public.ai_usage_share_effective(text, bigint, smallint, bigint) is
  'Part effective en jetons : pourcentage plancher du plafond commun (NULL sans plafond => sans effet), ou jetons bornes au plafond. Immutable, pure.';

-- 3. ai_usage_shares — les parts d'une collectivité, résolues, avec leur
--    consommation. SECURITY INVOKER : sous RLS pour l'écran, hors RLS pour
--    l'edge function (motif `ai_usage_breakdown`).
create or replace function public.ai_usage_shares(
  p_org_id uuid,
  p_period text default null
) returns table (
  consumer          text,
  limit_mode        text,
  limit_percent     smallint,
  configured_tokens bigint,
  effective_tokens  bigint,
  is_active         boolean,
  used_tokens       bigint,
  reserved_tokens   bigint,
  updated_at        timestamptz
)
language sql
stable
security invoker
set search_path to 'public'
as $fn$
  with quota as (
    select q.monthly_limit_tokens as limit_tokens
      from public.ai_usage_quotas q
     where q.organization_id = p_org_id
       and q.provider = '__global__'
       and q.is_active
     limit 1
  )
  select s.consumer,
         s.limit_mode,
         s.limit_percent,
         s.monthly_limit_tokens,
         case when s.is_active
              then public.ai_usage_share_effective(
                     s.limit_mode, s.monthly_limit_tokens, s.limit_percent,
                     (select limit_tokens from quota))
              else null end,
         s.is_active,
         coalesce(c.used_tokens, 0)::bigint,
         coalesce(c.reserved_tokens, 0)::bigint,
         s.updated_at
    from public.ai_usage_consumer_quotas s
    left join public.ai_usage_consumer_counters c
      on c.organization_id = s.organization_id
     and c.consumer        = s.consumer
     and c.period          = coalesce(p_period, to_char((now() at time zone 'utc'), 'YYYY-MM'))
   where s.organization_id = p_org_id
   order by s.consumer;
$fn$;

comment on function public.ai_usage_shares(uuid, text) is
  'Parts reservees d''une collectivite, resolues contre le plafond commun actif (effective_tokens NULL = sans effet), avec leur consommation sur la periode. SECURITY INVOKER.';

revoke execute on function public.ai_usage_shares(uuid, text) from public, anon;
grant execute on function public.ai_usage_shares(uuid, text) to authenticated, service_role;

-- 4. reserve_ai_usage — la part se résout, et le reste se partage.
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

  v_bucket    text := case when coalesce(p_resource_type, '') = 'ocr' then 'batch' else 'chat' end;
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
  v_bound     bigint;               -- la borne de l'appelant sur le plafond commun
begin
  if v_consumer = '' then
    raise exception 'Consommateur manquant : la depense doit etre imputable.' using errcode = '22023';
  end if;

  -- ── PORTE 1 : LE DÉBIT (tentatives, refus compris) ─────────────────────
  if p_external_actor_id is not null then
    v_kind := 'actor';
    v_subject := p_external_actor_id::text;
    v_max := case when v_bucket = 'batch' then c_actor_batch else c_actor_chat end;
  else
    v_kind := 'consumer';
    v_subject := v_consumer;
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
    -- Les chiffres rendus sont ceux de L'APPELANT : sa borne, et l'engagé
    -- commun moins ce que les autres parts ont engagé.
    return query select null::uuid, false, 'quota_exceeded'::text,
                        v_bound,
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
                        v_bound,
                        greatest(v_used - v_others_used, 0),
                        greatest(v_reserved - v_others_reserved, 0),
                        v_period, v_renews;
  end if;
end $fn$;

alter function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  owner to postgres;
comment on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid) is
  'Reserve des jetons AVANT l''appel fournisseur. TROIS portes : le DEBIT (tentatives par minute), la PART de l''application si elle en a une (jetons ou pourcentage du plafond), puis le PLAFOND de la collectivite MOINS ce que les autres parts n''ont pas encore consomme. Chacune est UN update conditionnel. Un refus du plafond rend la reservation du sous-compteur. Les chiffres rendus sont ceux de l''appelant.';

-- ⚠️ Le `CREATE OR REPLACE` re-grante PUBLIC : REVOKE à re-poser ici.
revoke execute on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  to service_role;

-- 5. set_ai_usage_consumer_quota — jetons OU pourcentage. L'ancienne
--    signature est retirée : deux surcharges à défauts rendraient l'appel à
--    quatre arguments ambigu. Les appels positionnels existants
--    (org, consumer, jetons[, actif]) restent valides.
drop function if exists public.set_ai_usage_consumer_quota(uuid, text, bigint, boolean);

create function public.set_ai_usage_consumer_quota(
  p_org_id               uuid,
  p_consumer             text,
  p_monthly_limit_tokens bigint    default null,
  p_is_active            boolean   default true,
  p_limit_percent        integer   default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_consumer text := btrim(coalesce(p_consumer, ''));
  v_mode     text := case when p_limit_percent is not null then 'percent' else 'tokens' end;
  v_row      public.ai_usage_consumer_quotas%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'Le plafond d''utilisation IA est réservé au super administrateur.'
      using errcode = '42501';
  end if;
  if p_limit_percent is not null and p_monthly_limit_tokens is not null then
    raise exception 'La part se règle en jetons ou en pourcentage du plafond, pas les deux.'
      using errcode = '22023';
  end if;
  if v_mode = 'percent' and (p_limit_percent < 1 or p_limit_percent > 99) then
    raise exception 'Le pourcentage doit être compris entre 1 et 99 : une part qui prend tout le plafond n''est plus une part.'
      using errcode = '22023';
  end if;
  if v_mode = 'tokens' and coalesce(p_monthly_limit_tokens, 0) <= 0 then
    raise exception 'La part doit être un nombre de jetons strictement positif, ou un pourcentage du plafond.'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.applications a where a.id = v_consumer) then
    raise exception 'Application inconnue du registre.' using errcode = '23503';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_org_id) then
    raise exception 'Organisation introuvable.' using errcode = '23503';
  end if;

  insert into public.ai_usage_consumer_quotas (
    organization_id, consumer, limit_mode, monthly_limit_tokens, limit_percent,
    is_active, updated_at, updated_by
  ) values (
    p_org_id, v_consumer, v_mode,
    case when v_mode = 'tokens' then p_monthly_limit_tokens else null end,
    case when v_mode = 'percent' then p_limit_percent else null end,
    coalesce(p_is_active, true), now(), auth.uid()
  )
  on conflict (organization_id, consumer) do update set
    limit_mode           = excluded.limit_mode,
    monthly_limit_tokens = excluded.monthly_limit_tokens,
    limit_percent        = excluded.limit_percent,
    is_active            = excluded.is_active,
    updated_at           = now(),
    updated_by           = excluded.updated_by
  returning * into v_row;

  return to_jsonb(v_row);
end $fn$;

alter function public.set_ai_usage_consumer_quota(uuid, text, bigint, boolean, integer) owner to postgres;
comment on function public.set_ai_usage_consumer_quota(uuid, text, bigint, boolean, integer) is
  'Pose ou modifie la part reservee d''une application pour une collectivite (racine), en jetons (p_monthly_limit_tokens) OU en pourcentage du plafond (p_limit_percent). Desactiver conserve valeur et mode. Reserve au super admin (garde dans la fonction).';

-- La garde est DANS la fonction (motif `set_ai_usage_quota`).
revoke execute on function public.set_ai_usage_consumer_quota(uuid, text, bigint, boolean, integer) from public, anon;
grant execute on function public.set_ai_usage_consumer_quota(uuid, text, bigint, boolean, integer) to authenticated;
