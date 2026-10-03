-- Catégories PARTENAIRES (Arpège…) : les « métiers » d'Arpège deviennent des
-- catégories du catalogue de la racine, nommées « <Libellé> (Arpège) », et
-- chaque démarche Arpège est rangée dans la sienne.
--
-- Arpège les sert par `GET /v2/Metiers` (code + libellé) ; chaque démarche porte
-- son code (`CodeQualificationMetier`). Même marquage que les démarches
-- partenaires (20261002190000) : `integration_id` + `external_reference` (le
-- code du métier), écrits par la fonction `integration-procedures`.
--
-- ⚠️ Visibilité : comme ses démarches, une catégorie partenaire n'est servie
-- qu'aux applications rattachées à son intégration (public-api) — Iris ne doit
-- pas recevoir des catégories vides pour elle.

alter table public.categories
  add column if not exists integration_id     uuid references public.integrations(id) on delete restrict,
  add column if not exists external_reference text;

alter table public.categories
  drop constraint if exists categories_partner_reference;
alter table public.categories
  add constraint categories_partner_reference
  check ((integration_id is null) = (external_reference is null));

create unique index if not exists categories_partner_unique
  on public.categories (organization_id, integration_id, external_reference)
  where integration_id is not null;

comment on column public.categories.integration_id is
  'Intégration partenaire dont vient la catégorie (Arpège : un « métier »). NULL = catégorie du Socle. Servie aux seules applications de l''intégration.';
comment on column public.categories.external_reference is
  'Code de la catégorie chez le partenaire (Arpège : CodeQualificationMetier). Non nul si et seulement si integration_id l''est.';
