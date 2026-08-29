-- Privilèges de table sur `ai_usage_rate` — la défense qui manquait.
--
-- ⚠️ SUPABASE ACCORDE `all` AUX RÔLES DU SCHÉMA PUBLIC PAR DÉFAUT. Sans ce
-- `revoke`, la seule chose qui empêchait un `INSERT` depuis un navigateur était
-- l'absence de policy d'écriture — vrai, mais c'est une défense de moins, et
-- une divergence avec les trois autres tables `ai_usage_*`, qui portent ce
-- revoke depuis leur création. Le commentaire d'origine dit exactement
-- pourquoi : « lecture seule côté client, même si une policy d'écriture
-- apparaissait un jour par accident ».
--
-- Oublié à la première écriture de la table, et rattrapé par l'assertion R10a
-- du test SQL — qui vérifie `has_table_privilege('authenticated', …, 'insert')`
-- exactement comme E4d le fait pour `ai_usage_events`. C'est le genre de trou
-- qu'aucune relecture ne voit et qu'une assertion attrape en une seconde.
--
-- ⚠️ Le `grant select` qui suit n'est pas décoratif : le revoke emporte TOUT,
-- y compris la lecture dont la policy super admin a besoin. Une assertion le
-- garde aussi (R10c).

revoke all on table public.ai_usage_rate from anon, authenticated;
grant select on table public.ai_usage_rate to authenticated;
