-- Plafond d'utilisation IA — les six fonctions.
--
-- Deux familles, deux habilitations :
--
--   • LE CYCLE D'UN APPEL — reserve → (appel fournisseur) → settle, plus le
--     filet release_stale. Réservé au `service_role` : appelées par la fonction
--     `ai-api`, jamais par un navigateur.
--
--   • LE RÉGLAGE DU PLAFOND — set / delete, plus la ventilation en lecture.
--     Ouvertes à `authenticated`, la garde étant DANS la fonction.
--
-- ⚠️ PIÈGE `SECURITY DEFINER` / `current_user` : à l'intérieur d'une fonction
-- DEFINER, `current_user` devient le propriétaire. Toute garde fondée dessus y
-- vaudrait toujours vrai, y compris pour un vrai client authentifié. Les gardes
-- ci-dessous s'appuient sur `is_super_admin()`, fondée sur `auth.uid()` (GUC
-- `request.jwt.claims`) — insensible au changement de `current_user`. C'est
-- l'usage prescrit, et il ne faut pas y toucher.
--
-- ⚠️ Les REVOKE sont dans CETTE migration, et sont à re-poser à chaque
-- `CREATE OR REPLACE` : le replace re-grante PUBLIC.
--
-- ⚠️ AUCUNE de ces signatures ne peut transporter un prompt : que des bigint,
-- des uuid, et des énumérés courts. C'est la deuxième preuve du passe-plat,
-- après l'absence de colonne texte dans le schéma.
--
-- Portage du modèle Iris (20260828170100), avec l'imputation par consommateur
-- et la ventilation en plus. LA LOGIQUE DE `reserve_ai_usage` N'EST PAS
-- MODIFIÉE : l'UPDATE conditionnel est la porte de concurrence, il est éprouvé.

-- ---------------------------------------------------------------------------
-- reserve_ai_usage — la porte de concurrence.
-- ---------------------------------------------------------------------------
-- Le DROP précède le CREATE : changer les colonnes de sortie change le type de
-- retour, et `create or replace` le refuse (« cannot change return type »).
drop function if exists public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid);

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
  -- ⚠️ `usage_period` et NON `period` : une colonne de SORTIE nommée comme une
  -- colonne de table rend le nom ambigu dans `on conflict (…, period)`, la
  -- seule clause où un nom de colonne ne peut pas être qualifié. PostgreSQL
  -- refuse alors la fonction à l'exécution (42702). Les autres sorties
  -- (`used_tokens`, `reserved_tokens`) portent bien un nom de colonne, elles,
  -- mais ne sont jamais référencées sans qualification.
  usage_period    text,
  renews_at       date
)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  -- Période en UTC, explicitement : le Socle est désormais le PROPRIÉTAIRE de
  -- la période et de la date de renouvellement. Il les renvoie à ses
  -- consommateurs plutôt que de les laisser recalculer — un jumeau qui dérive
  -- ferait mentir le message « crédit renouvelé le … ».
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

  -- Plafond effectif : un plafond du fournisseur précis PRIME sur le global.
  select q.* into v_quota
    from public.ai_usage_quotas q
   where q.organization_id = p_org_id
     and q.provider in (p_provider, '__global__')
     and q.is_active
   order by (q.provider = p_provider) desc
   limit 1;

  -- Aucun plafond (ou désactivé) ⇒ ILLIMITÉ. C'est ce qui permet un
  -- déploiement progressif : une collectivité sans ligne de plafond n'est pas
  -- cassée par l'arrivée de l'assistant. L'appel est journalisé — on veut
  -- savoir ce qui a été consommé même hors plafond — mais aucun compteur n'est
  -- touché, et `counter_provider` reste NULL pour le dire.
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

  -- ── LE point de concurrence ────────────────────────────────────────────
  -- UN SEUL UPDATE conditionnel. Postgres prend le verrou de ligne dès
  -- l'évaluation du WHERE : deux transactions concurrentes sur la même ligne
  -- se sérialisent d'elles-mêmes (MVCC standard, valable dès READ COMMITTED —
  -- ni SERIALIZABLE ni verrou consultatif). Si 0 ligne est affectée, le
  -- plafond est atteint : refus SANS incrément et SANS avoir appelé le
  -- fournisseur.
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
    -- Refus. AUCUNE ligne de journal : le grand livre recense des APPELS, et
    -- un appel refusé n'a pas eu lieu. Le compteur dit déjà l'histoire.
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
  'Réserve des jetons AVANT l''appel fournisseur. UN seul UPDATE conditionnel = la sérialisation. 0 ligne ⇒ refus sans incrément. Aucun plafond configuré ⇒ illimité.';

-- ---------------------------------------------------------------------------
-- settle_ai_usage — le règlement, idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.settle_ai_usage(
  p_event_id      uuid,
  p_actual_tokens bigint,
  p_status        text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_event  public.ai_usage_events%rowtype;
  v_actual bigint;
begin
  if p_status not in ('completed', 'failed', 'timeout') then
    raise exception 'Statut de reglement invalide : %', p_status using errcode = '22023';
  end if;

  -- Idempotence : on ne transitionne QUE depuis 'reserved'. Un second appel
  -- (retry, ou balayage cron qui double un règlement) ne double jamais la
  -- consommation.
  select e.* into v_event
    from public.ai_usage_events e
   where e.id = p_event_id and e.status = 'reserved'
   for update;
  if v_event.id is null then
    return;
  end if;

  v_actual := greatest(coalesce(p_actual_tokens, v_event.estimated_tokens), 0);

  update public.ai_usage_events
     set status        = p_status,
         actual_tokens = case when p_status = 'completed' then v_actual else null end,
         settled_at    = now()
   where id = p_event_id;

  if v_event.counter_provider is null then
    return;
  end if;

  if p_status = 'completed' then
    update public.ai_usage_counters c
       set reserved_tokens = greatest(c.reserved_tokens - v_event.estimated_tokens, 0),
           used_tokens     = c.used_tokens + v_actual,
           updated_at      = now()
     where c.organization_id = v_event.organization_id
       and c.provider        = v_event.counter_provider
       and c.period          = v_event.period;
  else
    -- Échec / timeout : la réservation est LIBÉRÉE et `used_tokens` n'est
    -- JAMAIS touché. Un appel qui n'a pas abouti n'est pas facturé.
    update public.ai_usage_counters c
       set reserved_tokens = greatest(c.reserved_tokens - v_event.estimated_tokens, 0),
           updated_at      = now()
     where c.organization_id = v_event.organization_id
       and c.provider        = v_event.counter_provider
       and c.period          = v_event.period;
  end if;
end $fn$;

alter function public.settle_ai_usage(uuid, bigint, text) owner to postgres;
comment on function public.settle_ai_usage(uuid, bigint, text) is
  'Solde une réservation. Idempotent (ne transitionne que depuis reserved). completed ⇒ used += réel ; failed/timeout ⇒ réservation libérée, used JAMAIS touché.';

-- ---------------------------------------------------------------------------
-- release_stale_ai_reservations — le filet.
-- ---------------------------------------------------------------------------
create or replace function public.release_stale_ai_reservations(
  p_max_age_minutes int default 15
) returns int
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_id    uuid;
  v_count int := 0;
begin
  -- Une edge function peut mourir entre la réservation et le règlement
  -- (déploiement, timeout de plateforme). Sans ce balayage, sa réservation
  -- resterait posée jusqu'à la fin du mois et rognerait le plafond pour rien.
  for v_id in
    select e.id
      from public.ai_usage_events e
     where e.status = 'reserved'
       and e.created_at < now() - make_interval(mins => greatest(p_max_age_minutes, 1))
     order by e.created_at
     for update skip locked
  loop
    perform public.settle_ai_usage(v_id, null, 'timeout');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $fn$;

alter function public.release_stale_ai_reservations(int) owner to postgres;
comment on function public.release_stale_ai_reservations(int) is
  'Solde en timeout les réservations orphelines. Appelée par le job cron release-stale-ai-reservations.';

-- ---------------------------------------------------------------------------
-- ai_usage_breakdown — la ventilation par application.
-- Une implémentation, deux lecteurs : la route GET /v1/usage (service_role) et
-- la section superadmin (authenticated, filtrée ensuite par le RLS).
-- ---------------------------------------------------------------------------
create or replace function public.ai_usage_breakdown(
  p_org_id uuid,
  p_period text default null
) returns table (
  consumer text,
  feature  text,
  calls    bigint,
  tokens   bigint
)
language sql
stable
security invoker
set search_path to 'public'
as $fn$
  select e.consumer,
         e.feature,
         count(*)::bigint,
         coalesce(sum(coalesce(e.actual_tokens, 0)), 0)::bigint
    from public.ai_usage_events e
   where e.organization_id = p_org_id
     and e.period = coalesce(p_period, to_char((now() at time zone 'utc'), 'YYYY-MM'))
     and e.status = 'completed'
   group by e.consumer, e.feature
   order by 4 desc, 1, 2;
$fn$;

comment on function public.ai_usage_breakdown(uuid, text) is
  'Consommation d''une collectivité ventilée par application et fonctionnalité, sur une période. SECURITY INVOKER : sous RLS pour un client, hors RLS pour le service.';

-- ---------------------------------------------------------------------------
-- set_ai_usage_quota / delete_ai_usage_quota — l'UNIQUE porte d'écriture.
-- ---------------------------------------------------------------------------
create or replace function public.set_ai_usage_quota(
  p_org_id               uuid,
  p_monthly_limit_tokens bigint,
  p_is_active            boolean default true,
  p_provider             text default '__global__'
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_provider text := coalesce(nullif(btrim(p_provider), ''), '__global__');
  v_row      public.ai_usage_quotas%rowtype;
begin
  -- Voir l'en-tête : `is_super_admin()`, fondée sur auth.uid().
  if not public.is_super_admin() then
    raise exception 'Le plafond d''utilisation IA est réservé au super administrateur.'
      using errcode = '42501';
  end if;
  if coalesce(p_monthly_limit_tokens, 0) <= 0 then
    raise exception 'Le plafond doit être un nombre de jetons strictement positif.'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_org_id) then
    raise exception 'Organisation introuvable.' using errcode = '23503';
  end if;

  insert into public.ai_usage_quotas (
    organization_id, provider, monthly_limit_tokens, is_active, updated_at, updated_by
  ) values (
    p_org_id, v_provider, p_monthly_limit_tokens, coalesce(p_is_active, true), now(), auth.uid()
  )
  -- La sentinelle rend ce ON CONFLICT opérant.
  on conflict (organization_id, provider) do update set
    monthly_limit_tokens = excluded.monthly_limit_tokens,
    is_active            = excluded.is_active,
    updated_at           = now(),
    updated_by           = excluded.updated_by
  returning * into v_row;

  return jsonb_build_object(
    'organization_id', v_row.organization_id,
    'provider', v_row.provider,
    'monthly_limit_tokens', v_row.monthly_limit_tokens,
    'is_active', v_row.is_active,
    'updated_at', v_row.updated_at
  );
end $fn$;

alter function public.set_ai_usage_quota(uuid, bigint, boolean, text) owner to postgres;
comment on function public.set_ai_usage_quota(uuid, bigint, boolean, text) is
  'Pose ou modifie le plafond IA d''une collectivité. Super administrateur UNIQUEMENT (garde dans la fonction).';

create or replace function public.delete_ai_usage_quota(
  p_org_id   uuid,
  p_provider text default '__global__'
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_provider text := coalesce(nullif(btrim(p_provider), ''), '__global__');
  v_count    int;
begin
  if not public.is_super_admin() then
    raise exception 'Le plafond d''utilisation IA est réservé au super administrateur.'
      using errcode = '42501';
  end if;
  delete from public.ai_usage_quotas q
   where q.organization_id = p_org_id and q.provider = v_provider;
  get diagnostics v_count = row_count;
  -- Les compteurs et le grand livre SURVIVENT : retirer un plafond n'efface
  -- pas ce qui a été consommé.
  return jsonb_build_object('removed', v_count);
end $fn$;

alter function public.delete_ai_usage_quota(uuid, text) owner to postgres;
comment on function public.delete_ai_usage_quota(uuid, text) is
  'Retire le plafond IA d''une collectivité (consommation redevient illimitée). Super administrateur UNIQUEMENT. Compteurs et journal conservés.';

-- ---------------------------------------------------------------------------
-- Privilèges — à re-poser à CHAQUE CREATE OR REPLACE de ces fonctions.
-- ---------------------------------------------------------------------------
revoke execute on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.settle_ai_usage(uuid, bigint, text)
  from public, anon, authenticated;
-- release_stale : AUCUN grant. Le job cron s'exécute comme postgres,
-- propriétaire de la fonction.
revoke execute on function public.release_stale_ai_reservations(int)
  from public, anon, authenticated;

grant execute on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  to service_role;
grant execute on function public.settle_ai_usage(uuid, bigint, text)
  to service_role;

revoke execute on function public.set_ai_usage_quota(uuid, bigint, boolean, text) from public, anon;
revoke execute on function public.delete_ai_usage_quota(uuid, text) from public, anon;
grant execute on function public.set_ai_usage_quota(uuid, bigint, boolean, text) to authenticated;
grant execute on function public.delete_ai_usage_quota(uuid, text) to authenticated;

revoke execute on function public.ai_usage_breakdown(uuid, text) from public, anon;
grant execute on function public.ai_usage_breakdown(uuid, text) to authenticated, service_role;
