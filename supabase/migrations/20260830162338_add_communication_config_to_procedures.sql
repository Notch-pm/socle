-- Étape « Communication » du paramétrage des démarches, premier bloc : la visibilité.
-- Schéma possédé (contrat public consommé en aval), stocké en JSONB comme
-- requester_config / form_schema / knowledge_base. Nullable, additif : la RLS
-- existante de `procedures` (écriture is_super_admin() OR is_org_admin(organization_id))
-- couvre déjà cette colonne, aucune policy supplémentaire nécessaire.
--
-- Colonne unique plutôt que des colonnes dédiées : l'étape « Communication » a
-- vocation à accueillir d'autres blocs (accusés de réception, notifications…),
-- qui s'ajouteront comme clés du même JSON sans nouvelle migration — même motif
-- que les trois autres étapes.
ALTER TABLE public.procedures
  ADD COLUMN IF NOT EXISTS communication_config jsonb;

COMMENT ON COLUMN public.procedures.communication_config IS
  'Paramètres de communication de la démarche. Bloc « visibility » : portalVisible (proposée sur le portail usagers), publicationPeriodEnabled + publicationStart/publicationEnd (AAAA-MM-JJ, bornes incluses, null = non bornée). Contrat possédé, consommé en aval.';
