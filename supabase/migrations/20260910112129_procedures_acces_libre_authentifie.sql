-- Accès d'une démarche : **libre** (aucun compte requis) ou réservée aux
-- **usagers authentifiés** (l'usager doit être connecté à son espace pour la
-- déposer). Réglé à l'étape « Descriptif » du paramétrage, publié aux
-- applications de la gamme.
--
-- ⚠️ Ce n'est PAS une quatrième règle de publication. Une démarche réservée aux
-- usagers authentifiés reste au catalogue du portail et doit s'y voir : c'est en
-- la lisant que l'usager apprend qu'il doit se connecter. Les trois notions qui
-- décident de la publication (`status`, `organization_procedures.is_enabled`,
-- `communication_config.visibility`) ne changent pas — `access_mode` dit à
-- QUELLES CONDITIONS on la dépose, pas SI on la montre.
--
-- Défaut `libre`, y compris pour les lignes existantes : c'est ce qui est vrai
-- aujourd'hui (le portail dépose sans compte depuis le 2026-09-06, l'espace
-- usager n'existe pas encore). Le défaut inverse fermerait d'un coup tout un
-- catalogue que personne n'a déclaré fermé.
--
-- Additif : la RLS existante de `procedures` (écriture is_super_admin() OR
-- is_org_admin(organization_id)) couvre déjà cette colonne.
ALTER TABLE public.procedures
  ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'libre';

ALTER TABLE public.procedures
  DROP CONSTRAINT IF EXISTS procedures_access_mode_check;

ALTER TABLE public.procedures
  ADD CONSTRAINT procedures_access_mode_check CHECK (access_mode IN ('libre', 'authentifie'));

COMMENT ON COLUMN public.procedures.access_mode IS
  'Conditions d''accès : libre (aucun compte requis) ou authentifie (usager connecté à son espace). Défaut libre. Ne décide PAS de la publication — une démarche réservée reste au catalogue, c''est son dépôt qui exige un compte.';
