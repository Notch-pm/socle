-- Attributions d'un organisme — ce qu'il TRAITE et ce qu'il ne traite pas,
-- en texte court (Markdown, 2 000 caractères au plus), pour les agents et
-- leurs outils IA. Premier consommateur : Clara, dont l'IA propose le service
-- instructeur d'un courrier entrant. Servies par
-- `GET /v1/organizations/attributions?tenant_id=` (public-api, scope `read`).
--
-- ⚠️ INTERNE, JAMAIS AU PORTAIL. Ni `organization_user_info` (publique, lue
-- par l'assistant du portail), ni `organization_agent_guidance` (consignes
-- générales, racine seule) : trois textes, trois publics, jamais fusionnés.
--
-- Sur TOUTE organisation, SERVICES INTERNES COMPRIS : ce sont souvent eux qui
-- instruisent. Pas d'héritage — un organisme qui n'a rien écrit n'emprunte pas
-- les attributions de son parent.
--
-- Une table et non une colonne d'`organizations` (même raison que les deux
-- autres) : la liste des organisations se lit en `select("*")` partout.

-- 1. Table
create table public.organization_attributions (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  attributions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Même borne que l'éditeur (`MAX_ATTRIBUTIONS_LENGTH`, front et edge).
  constraint organization_attributions_length check (char_length(attributions) <= 2000)
);

create trigger set_organization_attributions_updated_at
  before update on public.organization_attributions
  for each row execute function public.set_updated_at();

-- 2. RLS : calquée sur `organization_user_info` — lecture pour les membres et
--    les administrateurs d'un ancêtre (qui doivent relire ce qu'ils éditent),
--    écriture pour l'administrateur de l'organisme ou de n'importe quel
--    ancêtre. Pas de suppression cliente : vider le texte suffit. L'API lit en
--    service role, hors RLS.
alter table public.organization_attributions enable row level security;

create policy "read organization_attributions" on public.organization_attributions
  for select to authenticated
  using (public.has_org_access(organization_id) or public.is_admin_of_self_or_ancestor(organization_id));

create policy "insert organization_attributions" on public.organization_attributions
  for insert to authenticated
  with check (public.is_admin_of_self_or_ancestor(organization_id));

create policy "update organization_attributions" on public.organization_attributions
  for update to authenticated
  using (public.is_admin_of_self_or_ancestor(organization_id))
  with check (public.is_admin_of_self_or_ancestor(organization_id));

comment on table public.organization_attributions is
  'Attributions d''un organisme (toute organisation, services internes compris) : ce qu''il traite et ne traite pas. INTERNE : agents et outils IA (Clara), jamais le portail. Servi par GET /v1/organizations/attributions. Pas d''heritage.';
comment on column public.organization_attributions.attributions is
  'Markdown, en francais, 2000 caracteres au plus. Chaine vide = rien d''ecrit.';
