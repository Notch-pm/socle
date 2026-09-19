-- Recommandations aux agents — ce qu'une collectivité dit à SES AGENTS, pour
-- toutes ses démarches à la fois : le rôle des agents, les spécificités de
-- l'accueil physique, des consignes générales (titre + texte), une FAQ et des
-- sources recommandées. Lues par les applications de la gamme (Iris : base de
-- connaissances et assistant IA ; Clara ensuite) par
-- `GET /v1/organizations/{id}/agent-guidance`.
--
-- C'est la version GLOBALE de `procedures.knowledge_base` (même public : l'agent
-- et son assistant), qui reste propre à chaque démarche. Les deux ne se
-- fusionnent jamais : un consommateur les montre côte à côte, et la consigne
-- d'une démarche l'emporte sur la consigne générale.
--
-- ⚠️ UNE TABLE, PAS UNE COLONNE D'`organizations`. La liste des organisations se
-- lit en `select("*")` — écrans d'administration comme `GET /v1/organizations` —
-- et ce texte peut peser plusieurs dizaines de kilo-octets : en colonne, chaque
-- chargement d'arbre le transporterait pour toutes les collectivités.
--
-- ⚠️ INTERNE, JAMAIS PUBLIC. Rien ici n'est destiné à l'usager : aucune route
-- `/v1/portal/*` ne le sert, et il ne va pas dans `portal_contents`.
--
-- Rattachement à l'organisation principale seulement (motif `portal_contents`,
-- `quartiers`) : c'est la doctrine de la collectivité, pas celle d'un service.
-- Une sous-organisation la lit sur sa racine (`resolve_agent_guidance`).

-- 1. Table
create table public.organization_agent_guidance (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  -- Contrat JSON possédé : `src/features/organizations/agentGuidance.ts`.
  guidance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organization_agent_guidance_object check (jsonb_typeof(guidance) = 'object'),
  -- Un garde-fou de taille, pas une règle métier : l'éditeur borne chaque texte ;
  -- la base refuse ce qu'aucun écran ne peut produire.
  constraint organization_agent_guidance_size check (length(guidance::text) <= 500000)
);

create trigger set_organization_agent_guidance_updated_at
  before update on public.organization_agent_guidance
  for each row execute function public.set_updated_at();

-- 2. Rattachement à une racine uniquement (motif enforce_portal_content_root_org).
create or replace function public.enforce_agent_guidance_root_org()
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
    raise exception 'Les recommandations aux agents se parametrent sur l''organisation principale (racine).';
  end if;
  return new;
end;
$$;

-- Les trois rôles, pas seulement `public` : Supabase pose des DEFAULT PRIVILEGES
-- qui accordent EXECUTE nommément à anon/authenticated. Sans effet sur le
-- déclenchement du trigger.
revoke execute on function public.enforce_agent_guidance_root_org()
  from public, anon, authenticated;

create trigger trg_enforce_agent_guidance_root_org
  before insert or update on public.organization_agent_guidance
  for each row execute function public.enforce_agent_guidance_root_org();

-- 3. RLS : calqué sur `portal_contents`. Lecture pour les membres de la racine,
--    écriture pour ses administrateurs (is_org_admin court-circuite déjà le
--    super admin). Pas de suppression cliente : vider les champs suffit. Les
--    applications lisent par l'API publique, en service role hors RLS, bornées
--    au périmètre de leur clé.
alter table public.organization_agent_guidance enable row level security;

create policy "read organization_agent_guidance" on public.organization_agent_guidance
  for select to authenticated using (public.has_org_access(organization_id));

create policy "insert organization_agent_guidance" on public.organization_agent_guidance
  for insert to authenticated with check (public.is_org_admin(organization_id));

create policy "update organization_agent_guidance" on public.organization_agent_guidance
  for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

comment on table public.organization_agent_guidance is
  'Recommandations aux agents d''une collectivite (organisation principale) : role des agents, accueil physique, consignes generales, FAQ, sources recommandees. Interne : jamais servi au portail. Contrat JSON : src/features/organizations/agentGuidance.ts ; servi par GET /v1/organizations/{id}/agent-guidance.';
comment on column public.organization_agent_guidance.guidance is
  'Contrat JSON possede { roleDescription, physicalReception, guidelines[{title,text}], faq[{question,answer}], recommendedSources[{url,description}] }. Textes en Markdown.';

-- 4. Recommandations APPLICABLES à une organisation quelconque : celles de sa
--    racine. Remontée faite une fois ici (motif `resolve_org_languages`), pas
--    réécrite par chaque consommateur. Aucune ligne = rien d'écrit.
create or replace function public.resolve_agent_guidance(p_org_id uuid)
returns table (source_organization_id uuid, guidance jsonb, updated_at timestamptz)
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
  select g.organization_id, g.guidance, g.updated_at
  from chain c
  join public.organization_agent_guidance g on g.organization_id = c.id
  where c.parent_id is null
  limit 1;
$$;

comment on function public.resolve_agent_guidance(uuid) is
  'Recommandations aux agents applicables a une organisation : celles de son organisation principale (racine). Aucune ligne si rien n''est ecrit.';

revoke all on function public.resolve_agent_guidance(uuid) from public, anon, authenticated;
grant execute on function public.resolve_agent_guidance(uuid) to service_role;
