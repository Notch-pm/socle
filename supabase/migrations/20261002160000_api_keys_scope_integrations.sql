-- Scope `integrations` : lecture de la configuration des intégrations
-- partenaires d'une collectivité, SECRETS COMPRIS
-- (`GET /v1/organizations/{id}/integrations/{slug}`, public-api 1.34.0).
--
-- Même statut que `smtp` : un accès à des identifiants, jamais accordé par
-- défaut, à ne cocher que pour l'application de la gamme qui exécute
-- l'intégration (Clara pour Arpège). `read` ne suffit pas.
--
-- ⚠️ La liste reprend TOUS les scopes existants : en oublier un rendrait
-- invalides, à la prochaine écriture, les clés qui le portent.
alter table public.api_keys drop constraint api_keys_scopes_known;
alter table public.api_keys
  add constraint api_keys_scopes_known
  check (scopes <@ array['read', 'contacts', 'smtp', 'ai', 'audience', 'integrations']::text[]);
