-- Catalogue de documents (modèles à variables) d'une organisation principale.
-- Des fichiers .doc/.docx/.odt déposés une fois au niveau de la collectivité,
-- porteurs de variables `{{usager.nom}}` qu'une application de la gamme
-- valorisera au moment de produire la pièce. Le Socle enregistre et publie :
-- il ne fusionne rien, et n'inspecte pas le contenu des fichiers.
--
-- Nommage : `document_templates` et non `documents`, pour ne pas se confondre
-- avec `document_types` (les pièces demandées à l'usager) ni avec le bucket
-- `procedure-documents` (les documents d'aide à l'agent). Ce sont des gabarits.

-- 1. Table — multi-tenant strict, rattachée à une organisation principale.
create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  type text not null check (type in ('interne', 'externe', 'courrier')),
  file_path text not null,
  file_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Libellé unique par organisation, insensible à la casse (convention document_types).
create unique index document_templates_org_name_unique
  on public.document_templates (organization_id, lower(name));

create index idx_document_templates_org on public.document_templates (organization_id);

create trigger set_document_templates_updated_at
  before update on public.document_templates
  for each row execute function public.set_updated_at();

-- 2. Rattachement à une racine uniquement (motif enforce_quartier_root_org).
create or replace function public.enforce_document_template_root_org()
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
    raise exception 'Un document doit etre rattache a une organisation principale (racine)';
  end if;
  return new;
end;
$$;

-- Les trois rôles, pas seulement `public` : Supabase pose des DEFAULT PRIVILEGES
-- qui accordent EXECUTE nommément à anon/authenticated (cf. migration
-- branding_functions_revoke_execute). Sans effet sur le déclenchement du trigger.
revoke execute on function public.enforce_document_template_root_org()
  from public, anon, authenticated;

create trigger trg_enforce_document_template_root_org
  before insert or update on public.document_templates
  for each row execute function public.enforce_document_template_root_org();

-- 3. RLS : lecture pour les membres de la racine, écriture pour les admins d'org
--    (is_org_admin court-circuite déjà le super admin) — calqué sur document_types.
alter table public.document_templates enable row level security;

create policy "read document_templates" on public.document_templates
  for select to authenticated using (has_org_access(organization_id));

create policy "write document_templates" on public.document_templates
  for all to authenticated
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));

-- 4. Bucket privé — l'isolation par organisation est portée par le RLS de
--    storage.objects, comme `procedure-documents`.
--    Convention de chemin : {organization_id}/{uid}-{fichier}
--    (pas d'id de document : le fichier est déposé avant que la ligne existe).
insert into storage.buckets (id, name, public, file_size_limit)
values ('document-templates', 'document-templates', false, 26214400) -- 25 MiB
on conflict (id) do nothing;

create policy "read document templates"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'document-templates'
    and has_org_access(((storage.foldername(name))[1])::uuid)
  );

create policy "insert document templates"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'document-templates'
    and is_org_admin(((storage.foldername(name))[1])::uuid)
  );

-- `using` ET `with check` : sans les deux, un objet pourrait être déplacé hors
-- de son tenant (l'ancien et le nouveau chemin doivent être autorisés).
create policy "update document templates"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'document-templates'
    and is_org_admin(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'document-templates'
    and is_org_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "delete document templates"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'document-templates'
    and is_org_admin(((storage.foldername(name))[1])::uuid)
  );
