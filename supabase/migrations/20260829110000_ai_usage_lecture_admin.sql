-- Consommation IA : ouvrir la LECTURE à l'administrateur de la collectivité.
--
-- Jusqu'ici les trois tables n'étaient lisibles que par le super administrateur,
-- parce que l'écran qui les servait était le sien. Mais le budget est celui de
-- la collectivité : c'est ELLE qui a besoin de savoir ce qu'elle consomme, et à
-- quel rythme elle approche de son plafond. Un client qui doit écrire à
-- l'éditeur pour connaître sa propre consommation n'a pas de tableau de bord,
-- il a un guichet.
--
-- ⚠️ LECTURE SEULE, ET C'EST TOUTE LA MIGRATION. Aucune policy d'écriture n'est
-- ajoutée : `set_ai_usage_quota` / `delete_ai_usage_quota` gardent leur garde
-- `is_super_admin()` À L'INTÉRIEUR de la fonction, et restent l'unique porte.
-- Poser son propre plafond serait pouvoir le lever — le budget se négocie avec
-- l'éditeur, il ne se sert pas.
--
-- POURQUOI `is_admin_of_self_or_ancestor` ET NON `is_org_admin` : les trois
-- tables sont clés sur une organisation RACINE (trigger
-- `enforce_ai_usage_quota_root_org`), où les deux prédicats coïncident — une
-- racine n'a pas d'ancêtre. On prend le helper du sous-arbre parce qu'il est le
-- motif transverse du Socle, qu'il est marqué STABLE, et qu'il resterait juste
-- si une ligne descendait un jour sous la racine. Un admin de SOUS-organisation
-- ne voit donc rien : il n'est admin ni de la racine ni d'un de ses ancêtres,
-- et le plafond n'est pas son affaire.
--
-- Les deux helpers court-circuitent déjà le super administrateur : ses écrans
-- (fiche de collectivité, vue inter-clients) continuent de fonctionner sans que
-- la policy ait à le nommer.

drop policy if exists ai_usage_quotas_select on public.ai_usage_quotas;
create policy ai_usage_quotas_select on public.ai_usage_quotas
  for select to authenticated
  using (public.is_admin_of_self_or_ancestor(organization_id));

drop policy if exists ai_usage_counters_select on public.ai_usage_counters;
create policy ai_usage_counters_select on public.ai_usage_counters
  for select to authenticated
  using (public.is_admin_of_self_or_ancestor(organization_id));

drop policy if exists ai_usage_events_select on public.ai_usage_events;
create policy ai_usage_events_select on public.ai_usage_events
  for select to authenticated
  using (public.is_admin_of_self_or_ancestor(organization_id));

comment on policy ai_usage_quotas_select on public.ai_usage_quotas is
  'Lecture par l''administrateur de la collectivité (et le super admin). L''écriture reste hors RLS : set_ai_usage_quota est l''unique porte.';

-- `ai_usage_breakdown` est SECURITY INVOKER et déjà accordée à `authenticated` :
-- elle passe donc sous ces policies sans changement. C'est exactement ce qu'on
-- veut — une implémentation, trois lecteurs (le service, l'éditeur, le client).
