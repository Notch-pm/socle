-- Étape 1 « Descriptif » : colonnes manquantes sur procedures
alter table public.procedures
  add column if not exists type text not null default 'externe',
  add column if not exists short_description text,
  add column if not exists input_duration_minutes integer;

alter table public.procedures drop constraint if exists procedures_type_check;
alter table public.procedures
  add constraint procedures_type_check check (type in ('interne', 'externe'));

alter table public.procedures drop constraint if exists procedures_input_duration_check;
alter table public.procedures
  add constraint procedures_input_duration_check
  check (input_duration_minutes is null or input_duration_minutes >= 0);

-- Multi-tenant strict : une démarche est rattachée à une organisation PRINCIPALE (racine).
create or replace function public.enforce_procedure_root_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent uuid;
begin
  if new.organization_id is null then
    return new;
  end if;
  select parent_id into parent from public.organizations where id = new.organization_id;
  if parent is not null then
    raise exception 'Une demarche doit etre rattachee a une organisation principale (racine)';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_procedure_root_org on public.procedures;
create trigger trg_enforce_procedure_root_org
  before insert or update of organization_id on public.procedures
  for each row execute function public.enforce_procedure_root_org();

-- Isolation tenant : retirer la policy permissive qui laissait tout global_role='admin'
-- écrire n'importe quelle démarche. Les policies fines (create/update/delete, scopées par
-- is_org_admin(organization_id) OR is_super_admin()) prennent le relais.
drop policy if exists "write procedures" on public.procedures;
