-- Correctif : `reserve_ai_usage` déclarait une colonne de SORTIE nommée
-- `period`, homonyme de la colonne d'`ai_usage_counters`. Le nom devenait
-- ambigu dans `on conflict (organization_id, provider, period)` — la seule
-- clause où un nom de colonne ne peut pas être qualifié — et PostgreSQL
-- refusait la fonction à l'exécution (42702).
-- La sortie s'appelle désormais `usage_period`. Les autres sorties qui portent
-- un nom de colonne (`used_tokens`, `reserved_tokens`) ne posent pas de
-- problème : elles ne sont jamais référencées sans qualification.
-- DROP obligatoire : changer les colonnes de sortie change le type de retour.
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
  event_id uuid, allowed boolean, reason text,
  limit_tokens bigint, used_tokens bigint, reserved_tokens bigint,
  usage_period text, renews_at date
)
language plpgsql security definer set search_path to 'public' as $fn$
declare
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

  select q.* into v_quota
    from public.ai_usage_quotas q
   where q.organization_id = p_org_id
     and q.provider in (p_provider, '__global__')
     and q.is_active
   order by (q.provider = p_provider) desc
   limit 1;

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

alter function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid) owner to postgres;
comment on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid) is
  'Réserve des jetons AVANT l''appel fournisseur. UN seul UPDATE conditionnel = la sérialisation. 0 ligne ⇒ refus sans incrément. Sortie `usage_period` et non `period` : voir le correctif d''ambiguïté.';

revoke execute on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  to service_role;
