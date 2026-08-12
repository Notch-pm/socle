-- Référentiel des usagers (contacts) — partagé Ariane / Clara / Iris / portail citoyen.
-- 4 tables : contacts, contact_roles (catalogue par racine), contact_role_assignments (n-n),
-- contact_external_references (identifiants tiers).
-- Écriture des fiches prévue via API dédiée (service role) : pas de policy RLS d'écriture
-- côté client, sauf le catalogue de rôles (paramétrage, admins d'org).

-- ---------------------------------------------------------------------------
-- 1. contacts
-- ---------------------------------------------------------------------------

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_type text not null
    constraint contacts_type_check check (contact_type in ('personne', 'entreprise', 'association', 'administration')),

  -- Personne physique
  civility text
    constraint contacts_civility_check check (civility in ('madame', 'monsieur')),
  first_name text,
  last_name text,
  usage_name text,
  birth_date date,

  -- Personne morale (entreprise / association / administration)
  legal_name text,
  siret text
    constraint contacts_siret_format check (siret is null or siret ~ '^[0-9]{14}$'),

  -- Coordonnées
  email text,
  mobile_phone text,
  landline_phone text,

  -- Adresse (à plat, volontairement simple)
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country text not null default 'France',

  -- Préférences & consentements
  preferred_channel text
    constraint contacts_preferred_channel_check check (preferred_channel in ('email', 'telephone', 'courrier')),
  consent_email boolean not null default false,
  consent_sms boolean not null default false,

  -- Note interne agents (jamais exposée au portail citoyen ni à l'API publique)
  internal_notes text,

  status text not null default 'active'
    constraint contacts_status_check check (status in ('active', 'archived')),

  -- Nom d'affichage uniforme pour toutes les applications consommatrices
  display_name text generated always as (
    case
      when contact_type = 'personne'
        then nullif(btrim(coalesce(usage_name, last_name, '') || ' ' || coalesce(first_name, '')), '')
      else legal_name
    end
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Invariants par type
  constraint contacts_civility_by_type check ((contact_type = 'personne') = (civility is not null)),
  constraint contacts_legal_name_by_type check ((contact_type <> 'personne') = (legal_name is not null)),
  constraint contacts_siret_by_type check (contact_type <> 'personne' or siret is null),
  constraint contacts_person_fields_by_type check (
    contact_type = 'personne'
    or (first_name is null and last_name is null and usage_name is null and birth_date is null)
  )
);

comment on table public.contacts is
  'Référentiel des usagers, partagé par toute la gamme (Ariane, Clara, Iris, portail citoyen). Un contact est rattaché à une organisation principale (racine) : les sous-organisations partagent le même référentiel. Écriture via API dédiée (service role), lecture par les membres de l''organisation.';
comment on column public.contacts.contact_type is 'Type de contact : personne | entreprise | association | administration. Gouverne les invariants (civilité obligatoire pour une personne, raison sociale obligatoire pour une structure).';
comment on column public.contacts.civility is 'Civilité (madame | monsieur). Obligatoire pour une personne physique : participe à l''identité pivot utilisée par les collectivités.';
comment on column public.contacts.usage_name is 'Nom d''usage (facultatif) ; last_name = nom de naissance.';
comment on column public.contacts.legal_name is 'Raison sociale — obligatoire pour entreprise / association / administration, interdite pour une personne.';
comment on column public.contacts.siret is 'SIRET (14 chiffres), facultatif, unique par organisation quand renseigné. Interdit pour une personne physique.';
comment on column public.contacts.preferred_channel is 'Canal de contact préféré : email | telephone | courrier.';
comment on column public.contacts.internal_notes is 'Note interne visible uniquement par les agents. Ne doit jamais être exposée au portail citoyen ni sérialisée dans l''API publique.';
comment on column public.contacts.status is 'active | archived — retrait réversible d''une fiche sans suppression (les applications aval référencent ces ids).';
comment on column public.contacts.display_name is 'Nom d''affichage généré : nom d''usage/nom + prénom pour une personne, raison sociale sinon. Contrat de tri/recherche uniforme pour les applications consommatrices.';

create index contacts_organization_id_idx on public.contacts (organization_id);
create index contacts_org_display_name_idx on public.contacts (organization_id, lower(display_name));
create unique index contacts_org_siret_unique on public.contacts (organization_id, siret) where siret is not null;

comment on index public.contacts_org_siret_unique is 'Un même SIRET ne peut exister qu''une fois par organisation (doublon certain).';

-- Rattachement à une organisation racine obligatoire (même motif que procedures / document_types / api_keys)
create or replace function public.enforce_contact_root_org()
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
    raise exception 'Un contact doit etre rattache a une organisation principale (racine)';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_contact_root_org
  before insert or update on public.contacts
  for each row execute function public.enforce_contact_root_org();

create trigger set_contacts_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. contact_roles — catalogue de rôles par organisation racine
-- ---------------------------------------------------------------------------

create table public.contact_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

comment on table public.contact_roles is
  'Catalogue des rôles de contact (Habitant, Élu, Agent…), propre à chaque organisation racine, extensible sans migration. Même motif que document_types.';

create unique index contact_roles_org_name_unique on public.contact_roles (organization_id, lower(name));

comment on index public.contact_roles_org_name_unique is 'Nom de rôle unique par organisation, insensible à la casse.';

create or replace function public.enforce_contact_role_root_org()
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
    raise exception 'Un role de contact doit etre rattache a une organisation principale (racine)';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_contact_role_root_org
  before insert or update on public.contact_roles
  for each row execute function public.enforce_contact_role_root_org();

-- ---------------------------------------------------------------------------
-- 3. contact_role_assignments — jointure n-n contact <-> rôle
-- ---------------------------------------------------------------------------

create table public.contact_role_assignments (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role_id uuid not null references public.contact_roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint contact_role_assignments_unique unique (contact_id, role_id)
);

comment on table public.contact_role_assignments is
  'Rôles portés par un contact (n-n). Le contact et le rôle doivent appartenir à la même organisation racine (trigger).';

create index contact_role_assignments_role_id_idx on public.contact_role_assignments (role_id);

-- Le contact et le rôle doivent appartenir à la même organisation (un CHECK ne peut pas lire une autre table)
create or replace function public.enforce_contact_role_same_org()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  contact_org uuid;
  role_org uuid;
begin
  select organization_id into contact_org from public.contacts where id = new.contact_id;
  select organization_id into role_org from public.contact_roles where id = new.role_id;
  if contact_org is null or role_org is null or contact_org <> role_org then
    raise exception 'Le contact et le role doivent appartenir a la meme organisation';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_contact_role_same_org
  before insert or update on public.contact_role_assignments
  for each row execute function public.enforce_contact_role_same_org();

-- ---------------------------------------------------------------------------
-- 4. contact_external_references — identifiants dans les logiciels tiers
-- ---------------------------------------------------------------------------

create table public.contact_external_references (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  -- Dénormalisée depuis le contact (posée par trigger) : permet l'unicité (org, source, external_id)
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source text not null
    constraint contact_external_references_source_check check (btrim(source) <> ''),
  external_id text not null
    constraint contact_external_references_external_id_check check (btrim(external_id) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_external_references_contact_source_unique unique (contact_id, source)
);

comment on table public.contact_external_references is
  'Identifiants d''un contact dans les logiciels tiers (portail citoyen, logiciel population, état civil…). Un identifiant par système et par contact ; dans une organisation, un identifiant externe pointe vers au plus un contact.';
comment on column public.contact_external_references.organization_id is 'Copie de contacts.organization_id, posée automatiquement par trigger — support de l''unicité (organization_id, source, external_id).';
comment on column public.contact_external_references.source is 'Code libre du système tiers (ex. portail_citoyen, logiciel_population, etat_civil).';

create unique index contact_external_refs_org_source_ext_unique
  on public.contact_external_references (organization_id, source, external_id);

comment on index public.contact_external_refs_org_source_ext_unique is 'Dans une organisation, un identifiant externe (source + id) ne peut référencer qu''un seul contact.';

-- organization_id toujours dérivée du contact (y compris si contact_id change)
create or replace function public.sync_contact_external_ref_org()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  select organization_id into new.organization_id from public.contacts where id = new.contact_id;
  if new.organization_id is null then
    raise exception 'Contact introuvable pour la reference externe';
  end if;
  return new;
end;
$$;

create trigger trg_sync_contact_external_ref_org
  before insert or update on public.contact_external_references
  for each row execute function public.sync_contact_external_ref_org();

create trigger set_contact_external_references_updated_at
  before update on public.contact_external_references
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.contacts enable row level security;
alter table public.contact_roles enable row level security;
alter table public.contact_role_assignments enable row level security;
alter table public.contact_external_references enable row level security;

-- contacts : lecture par les membres de l'organisation ; AUCUNE écriture côté client
-- (écriture uniquement via la future API dédiée, en service role — hors RLS)
create policy "read contacts"
  on public.contacts for select
  to authenticated
  using (has_org_access(organization_id));

-- contact_roles : catalogue = paramétrage → lecture membres, écriture admins d'org
-- (is_org_admin court-circuite déjà le super admin)
create policy "read contact_roles"
  on public.contact_roles for select
  to authenticated
  using (has_org_access(organization_id));

create policy "write contact_roles"
  on public.contact_roles for all
  to authenticated
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));

-- contact_role_assignments : mêmes droits de lecture que la fiche contact ; pas d'écriture client
create policy "read contact_role_assignments"
  on public.contact_role_assignments for select
  to authenticated
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_id and has_org_access(c.organization_id)
    )
  );

-- contact_external_references : lecture directe via l'org dénormalisée ; pas d'écriture client
create policy "read contact_external_references"
  on public.contact_external_references for select
  to authenticated
  using (has_org_access(organization_id));

-- ---------------------------------------------------------------------------
-- Seed : rôles d'exemple pour chaque organisation racine existante
-- ---------------------------------------------------------------------------

insert into public.contact_roles (organization_id, name)
select o.id, r.name
from public.organizations o
cross join (
  values
    ('Habitant'),
    ('Représentant d''entreprise'),
    ('Président d''association'),
    ('Élu'),
    ('Agent'),
    ('Propriétaire'),
    ('Demandeur'),
    ('Bénéficiaire')
) as r(name)
where o.parent_id is null
on conflict do nothing;
