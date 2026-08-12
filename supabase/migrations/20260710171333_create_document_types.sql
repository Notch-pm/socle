-- Catalogue des types de piece justificative, propre a chaque organisation
-- principale (racine). Alimente le champ « piece justificative » du form builder.
create table public.document_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamp without time zone default now()
);

-- Libelle unique au sein d'une organisation, insensible a la casse.
create unique index document_types_org_name_unique
  on public.document_types (organization_id, lower(name));

-- Recherche par organisation.
create index document_types_organization_id_idx
  on public.document_types (organization_id);

-- Un type de piece doit etre rattache a une organisation principale (racine),
-- comme les demarches (voir enforce_procedure_root_org).
create or replace function public.enforce_document_type_root_org()
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
    raise exception 'Un type de piece justificative doit etre rattache a une organisation principale (racine)';
  end if;
  return new;
end;
$$;

create trigger enforce_document_type_root_org
  before insert or update on public.document_types
  for each row execute function public.enforce_document_type_root_org();

-- RLS calque sur les categories : lecture pour tout membre, ecriture pour l'admin.
alter table public.document_types enable row level security;

create policy "read document_types" on public.document_types
  for select using (has_org_access(organization_id));

create policy "write document_types" on public.document_types
  for all using (is_org_admin(organization_id)) with check (is_org_admin(organization_id));
