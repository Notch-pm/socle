-- Assistant du portail usagers — un troisième niveau : le DIALOGUE VOCAL.
--
-- L'assistant prononce ses réponses et l'usager peut répondre de vive voix
-- (plan du 2026-10-09 ; transcription et synthèse par `ai-api` 1.4.0). Même
-- interrupteur, même règle que `deposit_enabled` : un troisième booléen sur la
-- ligne de la racine, écrit par le SUPER ADMIN seul (RLS inchangé).
--
-- POURQUOI UN INTERRUPTEUR DISTINCT, et pas « assistant ouvert ⇒ voix » :
-- la voix coûte plusieurs fois le texte (la synthèse de 350 caractères pèse
-- plus que l'appel au modèle qui les a écrits) et elle fait traiter la VOIX de
-- l'usager par un sous-traitant. Les deux appellent une décision explicite,
-- prise avec la part de crédit de l'assistant.
--
-- ⚠️ Le réglage gouverne l'usage, pas la donnée : couper `enabled` CONSERVE
-- `voice_enabled` ; c'est l'API publique qui sert `voice_enabled = false` tant
-- que l'assistant est fermé (`readPortalAssistant`).

alter table public.portal_assistant_settings
  add column voice_enabled boolean not null default false;

comment on column public.portal_assistant_settings.voice_enabled is
  'L''assistant propose un mode dialogue : il prononce ses reponses et l''usager peut repondre de vive voix. Conserve quand enabled est coupe : l''API publique sert false tant que l''assistant est ferme.';

-- La forme rendue change : `create or replace` ne le permet pas, d'où le DROP.
-- Seul `public-api` (service role) l'appelle, et il lit une ligne absente
-- comme un assistant fermé : la fenêtre entre les deux instructions, dans la
-- même transaction, n'existe pas pour lui.
drop function public.resolve_portal_assistant(uuid);

create function public.resolve_portal_assistant(p_org_id uuid)
returns table (source_organization_id uuid, enabled boolean, deposit_enabled boolean, voice_enabled boolean)
language sql
stable
set search_path to 'public'
as $$
  with recursive chain as (
    select o.id, o.parent_id, 0 as depth
    from public.organizations o
    where o.id = p_org_id
    union all
    select o.id, o.parent_id, c.depth + 1
    from public.organizations o
    join chain c on o.id = c.parent_id
    where c.depth < 20 -- garde-fou (10 niveaux max, cycles bloqués par enforce_org_depth)
  )
  select s.organization_id, s.enabled, s.deposit_enabled, s.voice_enabled
  from chain c
  join public.portal_assistant_settings s on s.organization_id = c.id
  where c.parent_id is null
  limit 1;
$$;

comment on function public.resolve_portal_assistant(uuid) is
  'Reglage de l''assistant du portail applicable a une organisation : celui de son organisation principale (racine). Aucune ligne si l''assistant n''a jamais ete ouvert.';

-- ⚠️ Une fonction recréée reçoit les EXECUTE par défaut : les trois rôles,
-- nommément, avant de rendre le droit au seul service role.
revoke all on function public.resolve_portal_assistant(uuid) from public, anon, authenticated;
grant execute on function public.resolve_portal_assistant(uuid) to service_role;
