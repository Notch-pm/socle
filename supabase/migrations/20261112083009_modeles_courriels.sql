-- Modèles de courriels d'une collectivité, consommés par les applications de la gamme.
--
-- Deux familles :
--  • les courriels SYSTÈME — ceux qu'une application envoie déjà aux usagers
--    (Iris : accusé de réception, avis de statut, clôture…). Leur catalogue est
--    plateforme (`email_template_defaults`), figé par migration ; une
--    collectivité n'en change que l'OBJET et le CORPS, par une ligne de
--    surcharge dans `email_templates` (`system_key`). Jamais supprimables : le
--    défaut vit dans le catalogue, que personne n'écrit ; retirer la surcharge
--    = « rétablir le texte d'origine ».
--  • les modèles CRÉÉS par la collectivité (`system_key` NULL), avec leurs
--    applications d'usage (`email_template_applications`).
--
-- Héritage résolu à la lecture, jamais recopié (motif charte / SMTP) : aucune
-- ligne par client tant qu'il ne personnalise rien, et un courriel système
-- ajouté demain apparaît chez tous les clients sans reprise de données.
--
-- Le Socle enregistre et publie, il ne fusionne rien : objet et corps sont du
-- texte brut à variables `{{domaine.cle}}` (sections `{{#cle}}…{{/cle}}` pour
-- une partie conditionnelle). L'habillage (charte, bouton, pied, lien de
-- désinscription) reste le gabarit de l'application qui envoie.

-- 1. Catalogue plateforme des courriels système.
create table public.email_template_defaults (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  name text not null,
  description text,
  subject text not null,
  body text not null,
  application_ids text[] not null default '{}',
  variables text[] not null default '{}',
  position int not null default 0
);

alter table public.email_template_defaults enable row level security;

-- Lecture pour tout utilisateur connecté ; AUCUNE policy d'écriture : seule
-- une migration fait évoluer le catalogue.
create policy "read email_template_defaults" on public.email_template_defaults
  for select to authenticated using (true);

-- 2. Surcharges de courriels système et modèles créés, par racine.
create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  system_key text references public.email_template_defaults(key) on delete cascade,
  name text check (name is null or length(name) <= 200),
  description text check (description is null or length(description) <= 1000),
  subject text not null check (length(btrim(subject)) > 0 and length(subject) <= 255),
  body text not null check (length(btrim(body)) > 0 and length(body) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un courriel système garde le titre du catalogue ; un modèle créé a le sien.
  constraint email_templates_name_by_kind check (
    (system_key is not null and name is null and description is null)
    or (system_key is null and name is not null and length(btrim(name)) > 0)
  )
);

create unique index email_templates_org_system_unique
  on public.email_templates (organization_id, system_key) where system_key is not null;

create unique index email_templates_org_name_unique
  on public.email_templates (organization_id, lower(name)) where system_key is null;

create index idx_email_templates_org on public.email_templates (organization_id);

create trigger set_email_templates_updated_at
  before update on public.email_templates
  for each row execute function public.set_updated_at();

-- Rattachement à une racine uniquement (motif enforce_document_template_root_org).
create or replace function public.enforce_email_template_root_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent uuid;
begin
  select parent_id into parent from public.organizations where id = new.organization_id;
  if parent is not null then
    raise exception 'Un modele de courriel doit etre rattache a une organisation principale (racine)';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_email_template_root_org()
  from public, anon, authenticated;

create trigger trg_enforce_email_template_root_org
  before insert or update on public.email_templates
  for each row execute function public.enforce_email_template_root_org();

alter table public.email_templates enable row level security;

create policy "read email_templates" on public.email_templates
  for select to authenticated using (has_org_access(organization_id));

create policy "write email_templates" on public.email_templates
  for all to authenticated
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));

-- 3. Applications d'usage d'un modèle CRÉÉ (celles d'un courriel système sont
--    figées dans le catalogue). La policy d'écriture refuse un lien posé sur
--    une surcharge de courriel système.
create table public.email_template_applications (
  email_template_id uuid not null references public.email_templates(id) on delete cascade,
  application_id text not null references public.applications(id) on delete cascade,
  primary key (email_template_id, application_id)
);

create index idx_email_template_applications_app
  on public.email_template_applications (application_id);

alter table public.email_template_applications enable row level security;

create policy "read email_template_applications" on public.email_template_applications
  for select to authenticated using (
    exists (
      select 1 from public.email_templates t
      where t.id = email_template_id and has_org_access(t.organization_id)
    )
  );

create policy "write email_template_applications" on public.email_template_applications
  for all to authenticated
  using (
    exists (
      select 1 from public.email_templates t
      where t.id = email_template_id and t.system_key is null and is_org_admin(t.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.email_templates t
      where t.id = email_template_id and t.system_key is null and is_org_admin(t.organization_id)
    )
  );
