-- Les domaines du portail s'écrivent par le super administrateur seul.
--
-- Depuis le provisioning, une collectivité reçoit son sous-domaine fourni sans
-- geste ; un domaine PERSONNALISÉ (demarches.ville.fr) suppose un CNAME chez le
-- client et un enregistrement chez l'hébergeur du portail — un travail de
-- l'éditeur, pas un réglage de la collectivité. L'unicité étant globale, un
-- administrateur pouvait aussi réserver par erreur le futur domaine d'un autre
-- client. Les administrateurs LISENT leurs domaines (policy inchangée) et
-- voient la cible CNAME ; ils n'en posent plus.
drop policy if exists "write organization_domains" on public.organization_domains;

create policy "write organization_domains" on public.organization_domains
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
