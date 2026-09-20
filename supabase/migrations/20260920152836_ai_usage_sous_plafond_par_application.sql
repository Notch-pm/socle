-- Sous-plafond IA PAR APPLICATION — la part du crédit d'une collectivité qu'une
-- application donnée a le droit de consommer.
--
-- POURQUOI. Le plafond mensuel est commun à toutes les applications d'une
-- collectivité (règle 5 du modèle : « l'application discrimine le journal,
-- jamais le compteur »). C'était juste tant que tous les appelants étaient des
-- AGENTS. Depuis le 2026-09-20, l'assistant du portail usagers (application
-- `nora`) est ouvert à des visiteurs ANONYMES : sans borne propre, il peut
-- épuiser en quelques heures le crédit dont Iris et Clara ont besoin pour
-- instruire. Le sous-plafond dit : « Nora, pas plus de N jetons ce mois-ci »,
-- et laisse le reste aux agents.
--
-- ⚠️ LA RÈGLE 5 EST AMENDÉE, PAS ABANDONNÉE. Le plafond de la collectivité
-- reste UN compteur, commun, inchangé. Le sous-plafond est une porte EN PLUS,
-- pour les seules applications qui en portent un. Sans sous-plafond posé, RIEN
-- ne change : même chemin, mêmes lignes, mêmes réponses (assertions S1).
--
-- ⚠️ DEUX TABLES À PART, PAS UNE COLONNE `consumer` SUR LES EXISTANTES. Les
-- lecteurs en place font `find(provider = '__global__')` sur `ai_usage_quotas`
-- et `ai_usage_counters` : plusieurs lignes par fournisseur les tromperaient en
-- silence. Rien de ce dont Iris et Clara dépendent n'est altéré.
--
-- ORDRE DES PORTES dans `reserve_ai_usage` : débit → SOUS-PLAFOND → plafond.
-- Le plus étroit d'abord. ⚠️ Si le plafond de la collectivité refuse APRÈS un
-- sous-plafond réussi, la réservation du sous-compteur est RENDUE avant de
-- refuser — dans la même transaction, sous le verrou de ligne pris par le
-- premier UPDATE : aucun autre appel ne voit l'état intermédiaire.
--
-- Le journal gagne UNE colonne, `consumer_counted` (booléen) : le règlement doit
-- savoir si CET appel a réservé sur un sous-compteur — un sous-plafond posé ou
-- retiré entre la réservation et le règlement fausserait sinon le compte. Un
-- booléen ne porte aucun contenu : le passe-plat tient (test Q9 mis à jour).

-- 1. Le sous-plafond
create table public.ai_usage_consumer_quotas (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  -- L'application, telle qu'elle impute ses appels (`api_keys.consumer`).
  consumer             text not null references public.applications(id) on delete cascade,
  monthly_limit_tokens bigint not null check (monthly_limit_tokens > 0),
  -- Le réglage gouverne l'usage, pas la donnée : désactiver CONSERVE la valeur.
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references public.users(id) on delete set null,
  unique (organization_id, consumer)
);

-- Racine seulement : un budget est une affaire de collectivité. La fonction
-- existante ne lit que `new.organization_id` — elle sert telle quelle.
create trigger trg_enforce_ai_usage_consumer_quota_root_org
  before insert or update of organization_id on public.ai_usage_consumer_quotas
  for each row execute function public.enforce_ai_usage_quota_root_org();

-- 2. Le sous-compteur — même forme que `ai_usage_counters`, clé par application.
create table public.ai_usage_consumer_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  consumer        text not null,
  period          text not null check (period ~ '^\d{4}-\d{2}$'),
  used_tokens     bigint not null default 0 check (used_tokens >= 0),
  reserved_tokens bigint not null default 0 check (reserved_tokens >= 0),
  updated_at      timestamptz not null default now(),
  primary key (organization_id, consumer, period)
);

-- 3. RLS — lecture par l'administrateur de la collectivité (motif
--    `ai_usage_lecture_admin`), écriture par PERSONNE : les RPC sont la seule
--    porte. ⚠️ Un plafond que son porteur pourrait lever ne serait pas un plafond.
alter table public.ai_usage_consumer_quotas   enable row level security;
alter table public.ai_usage_consumer_counters enable row level security;

create policy ai_usage_consumer_quotas_select on public.ai_usage_consumer_quotas
  for select to authenticated using (public.is_admin_of_self_or_ancestor(organization_id));
create policy ai_usage_consumer_counters_select on public.ai_usage_consumer_counters
  for select to authenticated using (public.is_admin_of_self_or_ancestor(organization_id));

comment on table public.ai_usage_consumer_quotas is
  'Sous-plafond mensuel de jetons d''UNE application pour une collectivite (racine). Porte en plus du plafond commun (ai_usage_quotas), jamais a sa place. Aucune ligne active = aucune borne propre. Ecriture par les RPC set_/delete_ai_usage_consumer_quota (super admin).';
comment on table public.ai_usage_consumer_counters is
  'Consommation et reservations d''une application sur son sous-plafond, par periode. N''existe que pour les appels passes sous un sous-plafond actif (ai_usage_events.consumer_counted).';

-- 4. Le journal sait si l'appel a réservé sur un sous-compteur.
alter table public.ai_usage_events
  add column consumer_counted boolean not null default false;
comment on column public.ai_usage_events.consumer_counted is
  'Vrai si cet appel a reserve sur le sous-compteur de son application : c''est ce que le reglement doit solder. Un booleen, aucun contenu.';

-- 5. reserve_ai_usage — la porte en plus.
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
  v_cquota    public.ai_usage_consumer_quotas%rowtype;
  v_counted   boolean := false;
  v_event     uuid;
  v_rows      int;
  v_used      bigint;
  v_reserved  bigint;
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

  -- ── PORTE 2 : LE SOUS-PLAFOND DE L'APPLICATION (s'il y en a un) ────────
  -- Le plus étroit d'abord. Même mécanique que le plafond : UN update
  -- conditionnel, 0 ligne ⇒ refus sans incrément, fournisseur jamais appelé.
  select q.* into v_cquota
    from public.ai_usage_consumer_quotas q
   where q.organization_id = p_org_id
     and q.consumer        = v_consumer
     and q.is_active;

  if v_cquota.id is not null then
    insert into public.ai_usage_consumer_counters (organization_id, consumer, period)
         values (p_org_id, v_consumer, v_period)
    on conflict (organization_id, consumer, period) do nothing;

    update public.ai_usage_consumer_counters c
       set reserved_tokens = c.reserved_tokens + v_estimate,
           updated_at      = now()
     where c.organization_id = p_org_id
       and c.consumer        = v_consumer
       and c.period          = v_period
       and (c.used_tokens + c.reserved_tokens + v_estimate) <= v_cquota.monthly_limit_tokens;
    get diagnostics v_rows = row_count;

    if v_rows = 0 then
      select c.used_tokens, c.reserved_tokens into v_used, v_reserved
        from public.ai_usage_consumer_counters c
       where c.organization_id = p_org_id
         and c.consumer        = v_consumer
         and c.period          = v_period;
      -- Les chiffres rendus sont ceux du SOUS-plafond : c'est lui qui refuse.
      return query select null::uuid, false, 'consumer_quota_exceeded'::text,
                          v_cquota.monthly_limit_tokens, v_used, v_reserved, v_period, v_renews;
      return;
    end if;
    v_counted := true;
  end if;

  -- ── PORTE 3 : LE PLAFOND DE LA COLLECTIVITÉ ────────────────────────────
  select q.* into v_quota
    from public.ai_usage_quotas q
   where q.organization_id = p_org_id
     and q.provider in (p_provider, '__global__')
     and q.is_active
   order by (q.provider = p_provider) desc
   limit 1;

  -- Aucun plafond ⇒ ILLIMITÉ pour la collectivité — le sous-plafond, lui, a
  -- déjà borné l'application.
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
    -- ⚠️ Le sous-compteur a déjà réservé : on lui REND sa réservation avant de
    -- refuser. Sans cela, chaque refus du plafond commun rongerait le
    -- sous-plafond d'une application qui n'a rien consommé.
    if v_counted then
      update public.ai_usage_consumer_counters c
         set reserved_tokens = greatest(c.reserved_tokens - v_estimate, 0),
             updated_at      = now()
       where c.organization_id = p_org_id
         and c.consumer        = v_consumer
         and c.period          = v_period;
    end if;
    return query select null::uuid, false, 'quota_exceeded'::text,
                        v_quota.monthly_limit_tokens, v_used, v_reserved, v_period, v_renews;
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

  return query select v_event, true, 'ok'::text,
                      v_quota.monthly_limit_tokens, v_used, v_reserved, v_period, v_renews;
end $fn$;

alter function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  owner to postgres;
comment on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid) is
  'Reserve des jetons AVANT l''appel fournisseur. TROIS portes : le DEBIT (tentatives par minute), le SOUS-PLAFOND de l''application s''il existe, puis le PLAFOND de la collectivite. Chacune est UN update conditionnel. Un refus du plafond rend la reservation du sous-compteur. Aucun plafond => illimite, mais le debit et le sous-plafond s''appliquent.';

-- ⚠️ Le `CREATE OR REPLACE` re-grante PUBLIC : REVOKE à re-poser ici.
revoke execute on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  to service_role;

-- 6. settle_ai_usage — solde AUSSI le sous-compteur, quand l'appel y a réservé.
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

  -- Idempotence : on ne transitionne QUE depuis 'reserved'.
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

  -- Le sous-compteur D'ABORD, et AVANT le retour anticipé ci-dessous : une
  -- collectivité sans plafond peut tout de même borner une application.
  -- Même règle que le compteur commun : un échec libère, il ne facture pas.
  if v_event.consumer_counted then
    update public.ai_usage_consumer_counters c
       set reserved_tokens = greatest(c.reserved_tokens - v_event.estimated_tokens, 0),
           used_tokens     = c.used_tokens + case when p_status = 'completed' then v_actual else 0 end,
           updated_at      = now()
     where c.organization_id = v_event.organization_id
       and c.consumer        = btrim(v_event.consumer)
       and c.period          = v_event.period;
  end if;

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
  'Solde une reservation. Idempotent (ne transitionne que depuis reserved). completed => used += reel ; failed/timeout => reservation liberee, used JAMAIS touche. Solde aussi le sous-compteur de l''application quand l''appel y a reserve (consumer_counted).';

revoke execute on function public.settle_ai_usage(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.settle_ai_usage(uuid, bigint, text) to service_role;

-- 7. L'UNIQUE porte d'écriture du sous-plafond — réservée au super admin.
create or replace function public.set_ai_usage_consumer_quota(
  p_org_id               uuid,
  p_consumer             text,
  p_monthly_limit_tokens bigint,
  p_is_active            boolean default true
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_consumer text := btrim(coalesce(p_consumer, ''));
  v_row      public.ai_usage_consumer_quotas%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'Le plafond d''utilisation IA est réservé au super administrateur.'
      using errcode = '42501';
  end if;
  if coalesce(p_monthly_limit_tokens, 0) <= 0 then
    raise exception 'Le plafond doit être un nombre de jetons strictement positif.'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.applications a where a.id = v_consumer) then
    raise exception 'Application inconnue du registre.' using errcode = '23503';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_org_id) then
    raise exception 'Organisation introuvable.' using errcode = '23503';
  end if;

  insert into public.ai_usage_consumer_quotas (
    organization_id, consumer, monthly_limit_tokens, is_active, updated_at, updated_by
  ) values (
    p_org_id, v_consumer, p_monthly_limit_tokens, coalesce(p_is_active, true), now(), auth.uid()
  )
  on conflict (organization_id, consumer) do update set
    monthly_limit_tokens = excluded.monthly_limit_tokens,
    is_active            = excluded.is_active,
    updated_at           = now(),
    updated_by           = excluded.updated_by
  returning * into v_row;

  return to_jsonb(v_row);
end $fn$;

create or replace function public.delete_ai_usage_consumer_quota(
  p_org_id   uuid,
  p_consumer text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not public.is_super_admin() then
    raise exception 'Le plafond d''utilisation IA est réservé au super administrateur.'
      using errcode = '42501';
  end if;
  -- Le sous-COMPTEUR reste : c'est de l'historique de consommation, et un
  -- sous-plafond reposé dans le mois doit retrouver ce qui a déjà été dépensé.
  delete from public.ai_usage_consumer_quotas q
   where q.organization_id = p_org_id
     and q.consumer        = btrim(coalesce(p_consumer, ''));
end $fn$;

alter function public.set_ai_usage_consumer_quota(uuid, text, bigint, boolean) owner to postgres;
alter function public.delete_ai_usage_consumer_quota(uuid, text) owner to postgres;
comment on function public.set_ai_usage_consumer_quota(uuid, text, bigint, boolean) is
  'Pose ou modifie le sous-plafond d''une application pour une collectivite (racine). Reserve au super admin (garde dans la fonction).';
comment on function public.delete_ai_usage_consumer_quota(uuid, text) is
  'Retire le sous-plafond d''une application. Le sous-compteur est conserve. Reserve au super admin.';

-- La garde est DANS la fonction (motif `set_ai_usage_quota`) : exécutable par
-- un utilisateur connecté, refusée à qui n'est pas super admin.
revoke execute on function public.set_ai_usage_consumer_quota(uuid, text, bigint, boolean) from public, anon;
revoke execute on function public.delete_ai_usage_consumer_quota(uuid, text) from public, anon;
grant execute on function public.set_ai_usage_consumer_quota(uuid, text, bigint, boolean) to authenticated;
grant execute on function public.delete_ai_usage_consumer_quota(uuid, text) to authenticated;
