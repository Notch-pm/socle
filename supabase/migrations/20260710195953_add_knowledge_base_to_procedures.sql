-- Étape « Base de connaissances » du paramétrage des démarches.
-- Schéma possédé (contrat public consommé en aval), stocké en JSONB comme
-- requester_config / form_schema. Nullable, additif : la RLS existante de
-- `procedures` (écriture is_super_admin() OR is_org_admin(organization_id))
-- couvre déjà cette colonne, aucune policy supplémentaire nécessaire.
ALTER TABLE public.procedures
  ADD COLUMN IF NOT EXISTS knowledge_base jsonb;

COMMENT ON COLUMN public.procedures.knowledge_base IS
  'Base de connaissances à destination de l''agent et de son assistant LLM (texte d''aide, procédures, liens, FAQ, garde-fous, documents à venir). Contrat possédé, consommé en aval.';
