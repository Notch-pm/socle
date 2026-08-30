-- Cycle de vie du PARAMÉTRAGE d'une démarche : tant qu'elle est en brouillon,
-- sa configuration est en cours d'écriture et ne doit pas être servie comme
-- une démarche prête. Distinct de `communication_config.visibility` :
--   * `status`     = cette configuration est-elle finie ? (décision de l'agent)
--   * `visibility` = où et quand la proposer au public ? (décision d'exposition)
-- Une démarche « production » peut parfaitement ne pas être sur le portail
-- (démarche interne) ; une démarche « brouillon » n'est nulle part.
--
-- Défaut `brouillon`, y compris pour les lignes existantes : la notion n'existait
-- pas avant, personne n'a donc encore déclaré une démarche prête. Les passer
-- d'office en production affirmerait quelque chose que nul n'a dit.
--
-- Additif : la RLS existante de `procedures` (écriture is_super_admin() OR
-- is_org_admin(organization_id)) couvre déjà cette colonne.
ALTER TABLE public.procedures
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'brouillon';

ALTER TABLE public.procedures
  DROP CONSTRAINT IF EXISTS procedures_status_check;

ALTER TABLE public.procedures
  ADD CONSTRAINT procedures_status_check CHECK (status IN ('brouillon', 'production'));

COMMENT ON COLUMN public.procedures.status IS
  'Cycle de vie du paramétrage : brouillon (en cours d''écriture, ne pas servir) ou production (prête). Défaut brouillon. Ne pas confondre avec communication_config.visibility, qui dit où et quand proposer une démarche déjà prête.';
