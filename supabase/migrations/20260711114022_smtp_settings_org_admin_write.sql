
-- Jusqu'ici seul le super admin pouvait écrire les réglages SMTP ; l'admin de
-- l'organisation principale doit pouvoir configurer les siens. is_org_admin
-- court-circuite déjà le super admin, donc il conserve l'accès.
drop policy if exists "super admin can write smtp settings" on public.smtp_settings;

create policy "org admins can write smtp settings" on public.smtp_settings
  for all
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));
