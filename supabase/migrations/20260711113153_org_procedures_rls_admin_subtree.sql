
-- L'activation d'une démarche se fait au niveau de n'importe quelle organisation du
-- sous-arbre géré par l'admin (pas seulement son org directe). On aligne donc les
-- policies de organization_procedures sur le modèle « self ou ancêtre » déjà utilisé
-- par la table organizations (is_admin_of_self_or_ancestor est SECURITY DEFINER, et
-- court-circuite déjà le super admin).

alter policy "read org procedure bindings" on public.organization_procedures
  using (has_org_access(organization_id) or is_admin_of_self_or_ancestor(organization_id));

alter policy "enable procedure in org" on public.organization_procedures
  with check (is_admin_of_self_or_ancestor(organization_id));

alter policy "update org procedure" on public.organization_procedures
  using (is_admin_of_self_or_ancestor(organization_id))
  with check (is_admin_of_self_or_ancestor(organization_id));

alter policy "disable procedure" on public.organization_procedures
  using (is_admin_of_self_or_ancestor(organization_id));
