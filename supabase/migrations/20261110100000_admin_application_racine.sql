-- Annuaire des agents : l'administration d'une application vaut pour toute la
-- collectivité (décision du 2026-11-10).
--
-- Dans Clara comme dans Iris, un administrateur voit et règle TOUTE la
-- collectivité. Un accès « Administrateur » posé sur un simple service en
-- donnait donc plus que ce que l'écran du Socle affichait. Règle : un rôle
-- d'administration d'application (`application_roles.is_admin`) actif sur un
-- service exige le même rôle d'administration, actif, sur la RACINE. Les
-- services cochés en plus restent permis : ils servent d'affectations (Clara).
-- Le Socle n'est pas concerné (ses rôles vivent dans `user_organizations` :
-- son administrateur gère un sous-arbre).
--
-- Vérifié avant migration : les 40 accès « Administrateur » posés sur des
-- services (Clara, reprise du 2026-10-30) ont tous leur pendant sur la racine.
--
-- Et Iris gagne le rôle `administrateur` : il donnera, dans Iris, le profil
-- système « Administrateur » de la collectivité (profil verrouillé, géré par
-- le Socle) ; `acces` reste l'ouverture seule, sans profil.

-- --------------------------------------------------------------------------
-- 1. Rôle Iris « Administrateur ».
-- --------------------------------------------------------------------------
insert into public.application_roles (application_id, code, label, is_admin, sort_order)
select 'iris', 'administrateur', 'Administrateur', true, 20
where exists (select 1 from public.applications where id = 'iris')
on conflict do nothing;

-- --------------------------------------------------------------------------
-- 2. Règle de la racine, vérifiée en FIN DE TRANSACTION (contrainte
--    différée) : retirer d'un geste tous les accès d'un agent, ou poser la
--    racine et ses services dans une même requête, ne dépend pas de l'ordre
--    des lignes. L'écran envoie de toute façon la racine d'abord quand il
--    promeut, les services d'abord quand il rétrograde (`planAccessChanges`).
-- --------------------------------------------------------------------------
create or replace function public.enforce_application_admin_on_root() returns trigger
    language plpgsql security definer
    set search_path to 'public'
as $$
declare
  v_root uuid := public.organization_root_id(new.organization_id);
begin
  if v_root is null then
    return null;
  end if;
  if exists (
       select 1
       from public.user_application_access s
       join public.application_roles r
         on r.application_id = s.application_id and r.code = s.role_code and r.is_admin
       where s.user_id = new.user_id
         and s.application_id = new.application_id
         and s.is_active
         and s.organization_id <> v_root
         and public.organization_root_id(s.organization_id) = v_root
     )
     and not exists (
       select 1
       from public.user_application_access t
       join public.application_roles r
         on r.application_id = t.application_id and r.code = t.role_code and r.is_admin
       where t.user_id = new.user_id
         and t.application_id = new.application_id
         and t.is_active
         and t.organization_id = v_root
     ) then
    raise exception 'L''administration d''une application vaut pour toute la collectivité : elle exige le même accès sur la collectivité elle-même.'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

comment on function public.enforce_application_admin_on_root() is
  'Contrainte différée : un rôle d''administration d''application actif sur un service exige le même rôle actif sur la racine.';

alter function public.enforce_application_admin_on_root() owner to postgres;
revoke all on function public.enforce_application_admin_on_root() from public, anon, authenticated;

create constraint trigger trg_enforce_application_admin_on_root
  after insert or update of role_code, is_active, organization_id on public.user_application_access
  deferrable initially deferred
  for each row execute function public.enforce_application_admin_on_root();

-- --------------------------------------------------------------------------
-- 3. Accès au Socle sur les services : `user_organizations` suit enfin le
--    périmètre du reste de l'annuaire.
--
-- Ses policies demandaient d'être administrateur DIRECT de l'organisme
-- (`is_org_admin`), alors que l'écran des utilisateurs, `invite-user`,
-- `user_application_access` et `set_user_status` raisonnent en sous-arbre
-- (`is_admin_of_self_or_ancestor`, super admin compris). L'administrateur
-- d'une collectivité ne voyait donc pas l'accès au Socle d'un agent posé sur
-- l'un de ses services, et ne pouvait pas l'y ouvrir. Aucun pouvoir nouveau :
-- il gérait déjà ces services (organismes, démarches, accès aux applications).
--
-- Et le rôle se borne aux deux valeurs connues (aucune autre en base) : la
-- colonne était sans CHECK.
-- --------------------------------------------------------------------------
alter table public.user_organizations
  add constraint user_organizations_role_known check (role in ('admin', 'consultant'));

drop policy if exists "org admins can read org memberships" on public.user_organizations;
create policy "org admins can read org memberships" on public.user_organizations
  for select to authenticated
  using (public.is_admin_of_self_or_ancestor(organization_id));

drop policy if exists "admin can assign users to orgs" on public.user_organizations;
create policy "admin can assign users to orgs" on public.user_organizations
  for insert to authenticated
  with check (public.is_admin_of_self_or_ancestor(organization_id));

drop policy if exists "admin can remove users from orgs" on public.user_organizations;
create policy "admin can remove users from orgs" on public.user_organizations
  for delete to authenticated
  using (public.is_admin_of_self_or_ancestor(organization_id));
