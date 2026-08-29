-- Plafond d'utilisation IA — tables, RLS, privilèges.
--
-- Le Socle détient la clé du fournisseur LLM et compte ce qu'elle dépense, pour
-- toute la gamme. Une collectivité = un budget, quelle que soit l'application
-- qui puise dedans (Iris, Clara, ce qui viendra).
--
-- ┌─ LA PHRASE QUI RÉSUME LE MODÈLE ────────────────────────────────────────┐
-- │ L'application consommatrice discrimine le JOURNAL, jamais le compteur,   │
-- │ jamais le plafond.                                                       │
-- └──────────────────────────────────────────────────────────────────────────┘
-- `ai_usage_quotas` et `ai_usage_counters` sont donc clés sur l'organisation
-- RACINE seule ; seul `ai_usage_events` porte `consumer`. C'est ce qui permet
-- de répondre à « combien me coûte cette collectivité ? » ET à « qui a
-- dépensé ? » sans deux systèmes de comptage.
--
-- Portage d'un modèle déjà éprouvé (Iris, migration 20260828170000, test SQL à
-- 24 assertions). Les commentaires justificatifs voyagent avec le code, car
-- c'est eux qui empêchent de reproduire les dettes :
--
--  • SENTINELLE `'__global__'` DÈS L'ORIGINE. Clara avait écrit
--    `provider = NULL` pour « tous fournisseurs confondus » et a dû migrer :
--    deux NULL ne sont JAMAIS égaux pour une contrainte UNIQUE, donc
--    `ON CONFLICT (organization_id, provider)` ne rattrapait rien et empilait
--    une ligne de plus à chaque enregistrement.
--
--  • AUCUNE POLICY D'ÉCRITURE CLIENTE. Les RPC de la migration suivante sont
--    l'unique porte. PostgreSQL refuse par défaut ce qu'aucune policy ne
--    couvre — c'est tout ce qu'il faut.
--
--  • AUCUNE POLICY `service_role`. Les écrivains sont des fonctions
--    `SECURITY DEFINER`, qui s'exécutent comme le propriétaire et sortent donc
--    du RLS : une policy service serait du bruit.
--
-- ⚠️ AUCUNE COLONNE DE CE SCHÉMA NE PEUT CONTENIR UN PROMPT NI UNE RÉPONSE, et
-- c'est délibéré : le Socle est un passe-plat. Il voit le texte le temps de
-- l'appel, il ne le garde pas. Un test épingle l'ensemble exact des colonnes
-- d'`ai_usage_events` pour que l'ajout d'une colonne `prompt`/`content`/
-- `answer` casse la construction plutôt que de passer inaperçu.

-- ---------------------------------------------------------------------------
-- Le plafond
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage_quotas (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  provider             text not null default '__global__',
  period_unit          text not null default 'month' check (period_unit in ('month')),
  monthly_limit_tokens bigint not null check (monthly_limit_tokens > 0),
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references public.users(id) on delete set null,
  unique (organization_id, provider)
);

comment on table public.ai_usage_quotas is
  'Plafond mensuel de jetons IA d''une collectivité, tous produits de la gamme confondus. Écrit UNIQUEMENT par set_ai_usage_quota (super admin) — aucune policy d''écriture cliente.';
comment on column public.ai_usage_quotas.provider is
  'Sentinelle ''__global__'' = tous fournisseurs. JAMAIS NULL : deux NULL ne sont pas égaux pour un UNIQUE, ce qui casserait ON CONFLICT.';
comment on column public.ai_usage_quotas.monthly_limit_tokens is
  'Unité = JETONS, jamais des euros : le prix au jeton est une donnée commerciale qui bouge sans préavis, un montant affiché serait faux le jour du changement de tarif.';

-- ---------------------------------------------------------------------------
-- Le compteur vivant
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage_counters (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider        text not null default '__global__',
  period          text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  used_tokens     bigint not null default 0 check (used_tokens >= 0),
  reserved_tokens bigint not null default 0 check (reserved_tokens >= 0),
  updated_at      timestamptz not null default now(),
  unique (organization_id, provider, period)
);

comment on table public.ai_usage_counters is
  'Consommé + réservé par collectivité, fournisseur et période. Le passage au mois suivant crée naturellement une nouvelle ligne — AUCUN job de reset destructif.';
comment on column public.ai_usage_counters.period is
  'Période ''YYYY-MM'' en UTC. Texte borné par CHECK, pour permettre une autre granularité plus tard (un plafond horaire, par exemple) sans migration de type.';

-- ---------------------------------------------------------------------------
-- Le grand livre — des compteurs, des identifiants, des horodatages. Pas un
-- caractère de texte métier.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage_events (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  provider           text not null,
  counter_provider   text,
  -- L'IMPUTATION. Dénormalisée depuis api_keys.consumer au moment de l'appel,
  -- jamais lue dans le corps de la requête.
  consumer           text not null,
  api_key_id         uuid references public.api_keys(id) on delete set null,
  -- Déclaratif, fourni par l'appelant, et étiqueté comme tel : sert au détail
  -- (« assistant-instruction », « ocr-courrier ») sans donner à l'appelant
  -- autorité sur l'imputation.
  feature            text,
  resource_type      text not null check (resource_type in ('chat', 'agent', 'ocr')),
  status             text not null default 'reserved'
                       check (status in ('reserved', 'completed', 'failed', 'timeout')),
  estimated_tokens   bigint not null check (estimated_tokens >= 0),
  actual_tokens      bigint check (actual_tokens is null or actual_tokens >= 0),
  period             text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  -- Référence OPAQUE vers l'objet du consommateur (une demande Iris, un
  -- courrier Clara). UUID nus, sans FK : aucune clé étrangère ne franchit une
  -- frontière de projet — et une cascade effacerait une consommation facturée.
  external_ref_kind  text,
  external_ref_id    uuid,
  external_actor_id  uuid,
  -- clock_timestamp() et non now() : deux réservations dans la MÊME
  -- transaction doivent s'ordonner.
  created_at         timestamptz not null default clock_timestamp(),
  settled_at         timestamptz
);

comment on table public.ai_usage_events is
  'Grand livre des appels IA de la gamme. Ne conserve AUCUN texte de prompt ni de réponse — le Socle est un passe-plat, il voit le contenu le temps de l''appel et ne le garde pas.';
comment on column public.ai_usage_events.consumer is
  'Application qui a dépensé. Dénormalisé depuis api_keys.consumer, JAMAIS depuis le payload : un appelant ne peut pas imputer sa dépense à un autre.';
comment on column public.ai_usage_events.counter_provider is
  'Compteur réellement réservé. NULL = aucun plafond configuré à cet instant (l''appel a eu lieu, il n''a rien décompté).';
comment on column public.ai_usage_events.external_ref_id is
  'Identifiant de l''objet côté consommateur (demande, courrier). Opaque au Socle, sans FK, sans signification ici.';

create index if not exists ai_usage_counters_org_period_idx
  on public.ai_usage_counters (organization_id, period);
create index if not exists ai_usage_events_org_period_idx
  on public.ai_usage_events (organization_id, period, created_at desc);
-- Index partiel : le SEUL consommateur est le balayage des réservations
-- orphelines, qui ne regarde que les lignes encore 'reserved'.
create index if not exists ai_usage_events_stale_idx
  on public.ai_usage_events (created_at) where status = 'reserved';

-- ---------------------------------------------------------------------------
-- Le motif transverse du Socle : un plafond se pose sur une organisation
-- PRINCIPALE. Un budget est une affaire de collectivité, pas de service.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_ai_usage_quota_root_org()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  parent uuid;
begin
  select parent_id into parent from public.organizations where id = new.organization_id;
  if parent is not null then
    raise exception 'Un plafond IA doit etre rattache a une organisation principale (racine)';
  end if;
  return new;
end;
$$;

alter function public.enforce_ai_usage_quota_root_org() owner to postgres;
-- ⚠️ Révoquer de PUBLIC **en plus** d'anon et authenticated : sans cela, les
-- deux rôles héritent du droit d'EXECUTE accordé par défaut à la création, et
-- la fonction reste appelable via /rest/v1/rpc/ (advisors 0028/0029). Les
-- migrations plus anciennes du Socle omettent PUBLIC — c'est pourquoi quatre
-- fonctions DEFINER préexistantes sont encore signalées.
revoke all on function public.enforce_ai_usage_quota_root_org() from public, anon, authenticated;

drop trigger if exists trg_enforce_ai_usage_quota_root_org on public.ai_usage_quotas;
create trigger trg_enforce_ai_usage_quota_root_org
  before insert or update of organization_id on public.ai_usage_quotas
  for each row execute function public.enforce_ai_usage_quota_root_org();

-- ---------------------------------------------------------------------------
-- RLS — lecture par le super admin, écriture par personne (cf. en-tête).
-- ---------------------------------------------------------------------------
alter table public.ai_usage_quotas   enable row level security;
alter table public.ai_usage_counters enable row level security;
alter table public.ai_usage_events   enable row level security;

drop policy if exists ai_usage_quotas_select on public.ai_usage_quotas;
create policy ai_usage_quotas_select on public.ai_usage_quotas
  for select to authenticated using (public.is_super_admin());

drop policy if exists ai_usage_counters_select on public.ai_usage_counters;
create policy ai_usage_counters_select on public.ai_usage_counters
  for select to authenticated using (public.is_super_admin());

drop policy if exists ai_usage_events_select on public.ai_usage_events;
create policy ai_usage_events_select on public.ai_usage_events
  for select to authenticated using (public.is_super_admin());

-- Privilèges de table : lecture seule côté client, même si une policy
-- d'écriture apparaissait un jour par accident.
revoke all on table public.ai_usage_quotas   from anon, authenticated;
revoke all on table public.ai_usage_counters from anon, authenticated;
revoke all on table public.ai_usage_events   from anon, authenticated;
grant select on table public.ai_usage_quotas   to authenticated;
grant select on table public.ai_usage_counters to authenticated;
grant select on table public.ai_usage_events   to authenticated;
