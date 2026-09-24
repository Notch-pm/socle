-- Informations à destination des usagers — ce qu'un ORGANISME dit au public :
-- un descriptif, ses horaires d'accueil et une FAQ. Servies au site de
-- démarches par `GET /v1/portal/organizations`, donc au corpus de l'assistant
-- du portail (Nora), qui ne compose qu'à partir des routes `/v1/portal/*`.
--
-- ⚠️ PUBLIC, TOUT ENTIER. C'est le pendant usager des recommandations aux agents
-- (`organization_agent_guidance`, interne) : rien de ce qui sert à instruire n'y
-- entre, et les deux ne se fusionnent jamais. Le jour où l'on veut dire
-- quelque chose aux agents seulement, c'est l'autre table.
--
-- Sur TOUTE organisation, racine comme sous-organisation : chaque mairie
-- annexe, chaque service a ses horaires. Pas d'héritage — un organisme qui n'a
-- rien écrit n'affiche rien, il n'emprunte pas les horaires de son parent.
--
-- ⚠️ UNE TABLE, PAS UNE COLONNE D'`organizations` (même raison que
-- `organization_agent_guidance`) : la liste des organisations se lit en
-- `select("*")` partout, et ce texte peut peser des dizaines de kilo-octets.
--
-- Pas de brouillon : enregistrer, c'est publier (comme l'adresse ou le
-- téléphone de la fiche). L'écran le dit.

-- 1. Table
create table public.organization_user_info (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  -- Contrat JSON possédé : `src/features/organizations/userInfo.ts`.
  info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organization_user_info_object check (jsonb_typeof(info) = 'object'),
  -- Garde-fou de taille, pas une règle métier : l'éditeur borne chaque texte.
  constraint organization_user_info_size check (length(info::text) <= 200000)
);

create trigger set_organization_user_info_updated_at
  before update on public.organization_user_info
  for each row execute function public.set_updated_at();

-- 2. RLS : calquée sur `organizations` elle-même — lecture pour les membres et
--    les administrateurs d'un ancêtre, écriture pour l'administrateur de
--    l'organisme ou de n'importe quel ancêtre (le « pouvoir sur tout le
--    sous-arbre »). Pas de suppression cliente : vider les champs suffit. Le
--    portail lit par l'API publique, en service role hors RLS.
alter table public.organization_user_info enable row level security;

create policy "read organization_user_info" on public.organization_user_info
  for select to authenticated
  using (public.has_org_access(organization_id) or public.is_admin_of_self_or_ancestor(organization_id));

create policy "insert organization_user_info" on public.organization_user_info
  for insert to authenticated
  with check (public.is_admin_of_self_or_ancestor(organization_id));

create policy "update organization_user_info" on public.organization_user_info
  for update to authenticated
  using (public.is_admin_of_self_or_ancestor(organization_id))
  with check (public.is_admin_of_self_or_ancestor(organization_id));

comment on table public.organization_user_info is
  'Informations a destination des usagers d''un organisme (toute organisation) : descriptif, horaires d''accueil, FAQ. PUBLIC : servi par GET /v1/portal/organizations, corpus de l''assistant du portail. Contrat JSON : src/features/organizations/userInfo.ts.';
comment on column public.organization_user_info.info is
  'Contrat JSON possede { description, openingHours, faq[{question,answer}] }. Textes en Markdown, en francais.';
