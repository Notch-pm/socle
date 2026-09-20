-- Assistant du portail usagers — l'INTERRUPTEUR. Une collectivité propose-t-elle,
-- sur son site de démarches (Nora), un assistant conversationnel qui renseigne
-- l'usager, et cet assistant peut-il l'accompagner jusqu'au dépôt d'une demande ?
--
-- Le Socle ne sait pas ce que dit l'assistant : Nora compose son prompt à partir
-- de ce que `/v1/portal/*` sert déjà (ce que la collectivité écrit POUR l'usager)
-- et le confie au guichet `ai-api`. Ici ne vit que la décision de l'OUVRIR.
--
-- ⚠️ ÉCRITURE RÉSERVÉE AU SUPER ADMIN (motif `organization_applications`). Un
-- assistant public dépense le crédit IA de la collectivité, que ses agents
-- (Iris, Clara) partagent : l'ouvrir est une décision de mise en service, prise
-- avec le plafond, pas un réglage d'apparence du site. C'est aussi pourquoi il
-- ne vit PAS dans `portal_themes` : un interrupteur qu'on doit pouvoir couper
-- n'attend pas un « Publier ».
--
-- ⚠️ UNE TABLE, PAS UNE COLONNE D'`organizations` : les administrateurs d'une
-- organisation modifient leur ligne `organizations` ; une colonne y serait à
-- leur portée, ou demanderait un trigger de garde par colonne.
--
-- Rattachement à l'organisation principale seulement (motif `portal_themes`) :
-- le site est celui de la collectivité. Un domaine qui désigne une
-- sous-organisation lit le réglage de sa racine (`resolve_portal_assistant`).

-- 1. Table
create table public.portal_assistant_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  -- L'assistant est proposé sur le site : il renseigne et oriente.
  enabled boolean not null default false,
  -- Il peut en outre recueillir les réponses d'un formulaire dans la
  -- conversation. ⚠️ Le réglage gouverne l'usage, pas la donnée (motif
  -- `email_sender_name`) : couper `enabled` CONSERVE cette valeur ; c'est l'API
  -- publique qui sert `deposit_enabled = false` tant que l'assistant est fermé.
  deposit_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

create trigger set_portal_assistant_settings_updated_at
  before update on public.portal_assistant_settings
  for each row execute function public.set_updated_at();

-- 2. Rattachement à une racine uniquement (motif enforce_agent_guidance_root_org).
create or replace function public.enforce_portal_assistant_root_org()
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
    raise exception 'L''assistant du portail s''active sur l''organisation principale (racine).';
  end if;
  return new;
end;
$$;

-- Les trois rôles, pas seulement `public` : Supabase pose des DEFAULT PRIVILEGES
-- qui accordent EXECUTE nommément à anon/authenticated. Sans effet sur le
-- déclenchement du trigger.
revoke execute on function public.enforce_portal_assistant_root_org()
  from public, anon, authenticated;

create trigger trg_enforce_portal_assistant_root_org
  before insert or update on public.portal_assistant_settings
  for each row execute function public.enforce_portal_assistant_root_org();

-- 3. RLS : la collectivité LIT (son administrateur doit pouvoir savoir si
--    l'assistant est ouvert), seul le super admin ÉCRIT. Pas de suppression
--    cliente : fermer l'assistant, c'est `enabled = false`.
alter table public.portal_assistant_settings enable row level security;

create policy "read portal_assistant_settings" on public.portal_assistant_settings
  for select to authenticated using (public.has_org_access(organization_id));

create policy "insert portal_assistant_settings" on public.portal_assistant_settings
  for insert to authenticated with check (public.is_super_admin());

create policy "update portal_assistant_settings" on public.portal_assistant_settings
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

comment on table public.portal_assistant_settings is
  'Assistant conversationnel du portail usagers (Nora), une ligne par organisation principale. Aucune ligne = assistant ferme. Ecriture reservee au super admin ; servi par GET /v1/portal/tenant (champ assistant).';
comment on column public.portal_assistant_settings.enabled is
  'L''assistant est propose sur le site de demarches : il renseigne et oriente.';
comment on column public.portal_assistant_settings.deposit_enabled is
  'L''assistant peut recueillir un formulaire dans la conversation. Conserve quand enabled est coupe : l''API publique sert false tant que l''assistant est ferme.';

-- 4. Réglage APPLICABLE à une organisation quelconque : celui de sa racine.
--    Remontée faite une fois ici (motif `resolve_agent_guidance`). Aucune
--    ligne = assistant fermé.
create or replace function public.resolve_portal_assistant(p_org_id uuid)
returns table (source_organization_id uuid, enabled boolean, deposit_enabled boolean)
language sql
stable
set search_path to 'public'
as $$
  with recursive chain as (
    select o.id, o.parent_id, 0 as depth
    from public.organizations o
    where o.id = p_org_id
    union all
    select o.id, o.parent_id, c.depth + 1
    from public.organizations o
    join chain c on o.id = c.parent_id
    where c.depth < 20 -- garde-fou (10 niveaux max, cycles bloqués par enforce_org_depth)
  )
  select s.organization_id, s.enabled, s.deposit_enabled
  from chain c
  join public.portal_assistant_settings s on s.organization_id = c.id
  where c.parent_id is null
  limit 1;
$$;

comment on function public.resolve_portal_assistant(uuid) is
  'Reglage de l''assistant du portail applicable a une organisation : celui de son organisation principale (racine). Aucune ligne si l''assistant n''a jamais ete ouvert.';

revoke all on function public.resolve_portal_assistant(uuid) from public, anon, authenticated;
grant execute on function public.resolve_portal_assistant(uuid) to service_role;
