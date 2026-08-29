-- Plafond d'utilisation IA — balayage des réservations orphelines.
--
-- ⚠️ PREMIER JOB PLANIFIÉ DU SOCLE. `pg_cron` n'était pas installé jusqu'ici
-- (seul `supabase_vault` l'était). Conséquence d'exploitation à connaître : un
-- job en échec est SILENCIEUX. Quand des jetons réservés semblent bloqués, la
-- première chose à regarder est `cron.job_run_details` — voir
-- `docs/operations.md`.
--
-- Ce job n'a besoin d'AUCUN secret : c'est du SQL pur, il appelle une fonction
-- locale. Il n'y a pas de `net.http_post`, donc rien à aller chercher dans le
-- coffre.
--
-- Toutes les 5 minutes, une réservation de plus de 15 minutes est soldée en
-- `timeout` : la réservation est libérée, `used_tokens` n'est jamais touché.
-- C'est le filet du cas « la fonction est morte entre reserve et settle ».
-- Sans lui, la réservation rognerait le plafond jusqu'à la fin du mois.

create extension if not exists pg_cron;

select cron.unschedule('release-stale-ai-reservations')
 where exists (select 1 from cron.job where jobname = 'release-stale-ai-reservations');

select cron.schedule(
  'release-stale-ai-reservations',
  '*/5 * * * *',
  $job$ select public.release_stale_ai_reservations(15); $job$
);
