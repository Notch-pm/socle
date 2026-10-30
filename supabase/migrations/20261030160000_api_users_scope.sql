-- Annuaire des agents, lot 2 : les applications lisent leurs agents.
--
-- `GET /v1/users` (public-api) sert à une application les accès que le Socle
-- lui ouvre. Elle le lit par incréments (`updated_since`) : pas de webhook, la
-- base n'ayant pas `pg_net`, et pas de secret à poser par application.

-- 1. Le scope `users`.
--
-- ⚠️ La liste reprend TOUS les scopes existants : en oublier un rendrait
-- invalides, à la prochaine écriture, les clés qui le portent.
alter table public.api_keys drop constraint api_keys_scopes_known;
alter table public.api_keys
  add constraint api_keys_scopes_known
  check (scopes <@ array['read', 'contacts', 'smtp', 'ai', 'audience', 'integrations', 'signatures', 'citizen', 'users']::text[]);

-- 2. Un accès ne disparaît jamais.
--
-- La lecture incrémentale ne voit que ce qui a CHANGÉ : une ligne supprimée
-- ne changerait plus, et l'application garderait l'agent actif. Retirer un
-- accès, c'est `is_active = false` (l'écran ne fait que cela). Restent les
-- suppressions en cascade (organisme ou compte supprimé) : la réconciliation
-- complète de l'application (sans `updated_since`) les rattrape — un agent
-- absent de la liste complète n'a plus d'accès.
drop policy "delete user_application_access" on public.user_application_access;
revoke delete on table public.user_application_access from anon, authenticated;
