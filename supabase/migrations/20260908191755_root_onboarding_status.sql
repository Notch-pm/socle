-- État de mise en service d'une organisation principale — ce que la
-- check-list du superadmin affiche.
--
-- Une seule lecture plutôt que dix requêtes depuis l'écran, et surtout UNE
-- définition de « prêt » : la même pour l'écran d'aujourd'hui et pour ce qui
-- voudra la relire demain (un tableau de bord inter-clients, un rappel).
--
-- `returns jsonb` et non `returns table` : ajouter une clé (les applications
-- souscrites, au lot suivant) est un `create or replace` sans `drop function`,
-- et un lecteur qui ignore une clé inconnue ne casse pas.
--
-- SECURITY DEFINER parce qu'elle lit `resolve_smtp_settings`, dont l'EXECUTE
-- est réservé au service role ; la garde reproduit ce que le RLS accorderait
-- au lecteur sur chacune des tables consultées (super admin, ou admin de la
-- racine ou d'un ancêtre — pour une racine, d'elle-même).
create or replace function public.root_onboarding_status(p_org_id uuid) returns jsonb
    language plpgsql stable security definer
    set search_path to 'public'
as $$
declare
  v_org     public.organizations%rowtype;
  v_subtree uuid[];
begin
  if not (public.is_super_admin() or public.is_admin_of_self_or_ancestor(p_org_id)) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  select * into v_org from public.organizations where id = p_org_id;
  if not found then
    raise exception 'Organisation introuvable.' using errcode = '23503';
  end if;
  if v_org.parent_id is not null then
    raise exception 'La mise en service se lit sur une organisation principale (racine).'
      using errcode = '22023';
  end if;
  v_subtree := public.org_subtree_ids(p_org_id);

  return jsonb_build_object(
    -- Le relais résolu (propre, ou hérité — une racine n'hérite de rien).
    'smtp_configured', exists (select 1 from public.resolve_smtp_settings(p_org_id)),
    'admin_count', (
      select count(*) from public.user_organizations uo
      where uo.organization_id = p_org_id and uo.role = 'admin'
    ),
    'category_count', (
      select count(*) from public.categories c where c.organization_id = p_org_id
    ),
    'procedure_count', (
      select count(*) from public.procedures p where p.organization_id = p_org_id
    ),
    'procedure_production_count', (
      select count(*) from public.procedures p
      where p.organization_id = p_org_id and p.status = 'production'
    ),
    -- Sur tout l'arbre : c'est un organisme quelconque du sous-arbre qui
    -- active, pas la racine seule.
    'activation_count', (
      select count(*) from public.organization_procedures op
      where op.organization_id = any (v_subtree) and op.is_enabled
    ),
    'domain_count', (
      select count(*) from public.organization_domains d
      where d.organization_id = any (v_subtree)
    ),
    'portal_published', exists (
      select 1 from public.portal_pages pp
      where pp.organization_id = p_org_id and pp.slug = 'accueil' and pp.published is not null
    ),
    -- « Décidé » = une ligne existe ; « actif » = elle borne. Une ligne
    -- inactive est l'illimité EXPLICITE, pas un oubli.
    'ai_quota_decided', exists (
      select 1 from public.ai_usage_quotas q
      where q.organization_id = p_org_id and q.provider = '__global__'
    ),
    'ai_quota_active', exists (
      select 1 from public.ai_usage_quotas q
      where q.organization_id = p_org_id and q.provider = '__global__' and q.is_active
    ),
    'logo_present', v_org.logo_url is not null,
    'contact_role_count', (
      select count(*) from public.contact_roles cr where cr.organization_id = p_org_id
    )
  );
end;
$$;

comment on function public.root_onboarding_status(uuid) is
  'Compteurs et drapeaux de mise en service d''une racine (SMTP, admins, catégories, démarches, activations, domaines, page publiée, plafond IA, logo, rôles). Super admin ou admin de la racine.';

alter function public.root_onboarding_status(uuid) owner to postgres;
revoke all on function public.root_onboarding_status(uuid) from public, anon;
grant execute on function public.root_onboarding_status(uuid) to authenticated;
