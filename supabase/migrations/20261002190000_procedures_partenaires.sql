-- Démarches PARTENAIRES (Arpège…) au catalogue du Socle.
--
-- Une démarche Arpège vit désormais au Socle, comme les autres : catalogue de
-- la racine, catégorie, et surtout ACTIVATION PAR ORGANISATION
-- (`organization_procedures`, écran « Démarches activées ») — l'API Arpège ne
-- dit rien de quel service propose quelle démarche, le Socle en est donc le
-- seul détenteur possible. Clara la reçoit par sa synchronisation habituelle et
-- crée la demande chez le partenaire.
--
-- Trois colonnes, nulles pour une démarche du Socle :
--   • `integration_id`     — l'intégration qui la porte (catalogue `integrations`) ;
--   • `external_reference` — son code chez le partenaire (Arpège :
--     CodeQualificationTypeDemande) ;
--   • `partner_config`     — données du partenaire, OPAQUES pour le Socle :
--     stockées et transmises sans interprétation (Arpège : CodeQualificationMetier,
--     ConfigInfoUsagerObligs, FormComponents — le formulaire que Clara affiche).
--
-- Écrites par la fonction `integration-procedures` (service role, import depuis
-- le partenaire). L'écran ne change que la catégorie et les activations ;
-- le RLS existant ne bouge pas.
--
-- ⚠️ Visibilité : une démarche partenaire n'est servie par public-api qu'aux
-- applications rattachées à son intégration (`integration_applications`), et
-- JAMAIS au portail — règle tenue par public-api, pas par la base.

alter table public.procedures
  add column if not exists integration_id     uuid references public.integrations(id) on delete restrict,
  add column if not exists external_reference text,
  add column if not exists partner_config     jsonb;

alter table public.procedures
  drop constraint if exists procedures_partner_reference;
alter table public.procedures
  add constraint procedures_partner_reference
  check ((integration_id is null) = (external_reference is null));

alter table public.procedures
  drop constraint if exists procedures_partner_config_object;
alter table public.procedures
  add constraint procedures_partner_config_object
  check (partner_config is null or jsonb_typeof(partner_config) = 'object');

-- Une démarche partenaire par (racine, intégration, code) : c'est la clé de l'import.
create unique index if not exists procedures_partner_unique
  on public.procedures (organization_id, integration_id, external_reference)
  where integration_id is not null;

comment on column public.procedures.integration_id is
  'Intégration partenaire qui porte la démarche (Arpège…). NULL = démarche du Socle. Servie aux seules applications de l''intégration, jamais au portail.';
comment on column public.procedures.external_reference is
  'Code de la démarche chez le partenaire (Arpège : CodeQualificationTypeDemande). Non nul si et seulement si integration_id l''est.';
comment on column public.procedures.partner_config is
  'Données du partenaire, opaques pour le Socle, transmises telles quelles (Arpège : CodeQualificationMetier, ConfigInfoUsagerObligs, FormComponents).';
