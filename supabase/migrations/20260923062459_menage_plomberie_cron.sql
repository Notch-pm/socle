-- Purge de l'historique pg_cron.
--
-- Supabase ne purge pas `cron.job_run_details`. Le seul job actuel
-- (`release-stale-ai-reservations`, toutes les 5 min) y écrit ~288 lignes/jour :
-- 7 157 lignes / 1,6 Mo au 2026-09-23, mais la table grossit à chaque job ajouté
-- (Iris : 54 Mo en un mois avec deux jobs à la minute ; Clara : 112 417 lignes lors de
-- l'incident mémoire du 2026-09-22).
--
-- Pas de pendant `net._http_response` : le Socle n'utilise pas pg_net.
-- Rejouable : `cron.schedule` sur un nom existant met à jour la commande.

select cron.schedule(
  'purge-cron-history',
  '15 3 * * *',
  $job$ delete from cron.job_run_details where end_time < now() - interval '7 days' $job$
);
