-- ============================================================================
-- Tests de la règle « l'administration d'une application vaut pour toute la
-- collectivité » (migration `admin_application_racine`, 2026-11-10).
--
-- Même motif que `agents-acces.test.sql` : un bloc `DO` qui finit par un
-- `raise exception` volontaire s'annule lui-même et ne laisse aucune donnée.
-- La contrainte est DIFFÉRÉE : chaque vérification la force avec
-- `set constraints … immediate`.
--
-- Les règles tenues :
--   P. POSER : un administrateur sur un service exige le même rôle sur la
--      racine ; avec la racine, les services en plus sont permis ; un rôle
--      simple sur un service seul reste permis.
--   O. L'ORDRE NE COMPTE PAS DANS UNE TRANSACTION : racine et services posés
--      ou retirés dans n'importe quel ordre passent si l'état final est juste.
--   R. RETIRER OU RÉTROGRADER LA RACINE en laissant un service administrateur
--      est refusé ; tout retirer d'un geste passe.
--   I. Iris déclare le rôle `administrateur` (is_admin).
--   M. L'ADMINISTRATEUR DE LA COLLECTIVITÉ GÈRE L'ACCÈS AU SOCLE DE SES
--      SERVICES (`user_organizations` en sous-arbre) — rien chez la voisine ;
--      un rôle inconnu est refusé.
--
-- Exécution : contexte postgres (SQL editor, ou `execute_sql`) — l'échec
-- final VOLONTAIRE annule la transaction.
-- ============================================================================

do $main$
declare
  org_a   uuid;   -- collectivité A, abonnée à Clara
  org_b   uuid;   -- collectivité voisine
  u_admin uuid := gen_random_uuid();   -- administrateur Socle de A
  svc_1   uuid;   -- service de A
  svc_2   uuid;   -- service de A
  u_1 uuid := gen_random_uuid();
  u_2 uuid := gen_random_uuid();
  v_fail text[] := '{}';
  v_text text;
begin
  insert into public.users (id, email, global_role) values
    (u_1, 'un@admin-racine.test', 'consultant'),
    (u_2, 'deux@admin-racine.test', 'consultant'),
    (u_admin, 'admin@admin-racine.test', 'consultant');
  insert into public.organizations (name, parent_id) values ('Collectivité A', null) returning id into org_a;
  insert into public.organizations (name, parent_id) values ('Service 1', org_a) returning id into svc_1;
  insert into public.organizations (name, parent_id) values ('Service 2', org_a) returning id into svc_2;
  insert into public.organizations (name, parent_id) values ('Collectivité B', null) returning id into org_b;
  insert into public.user_organizations (user_id, organization_id, role) values (u_admin, org_a, 'admin');
  delete from public.organization_applications where organization_id = org_a;
  insert into public.organization_applications (organization_id, application_id) values (org_a, 'clara');

  -- I ------------------------------------------------------------------------
  if not exists (select 1 from public.application_roles where application_id = 'iris' and code = 'administrateur' and is_admin)
     and exists (select 1 from public.applications where id = 'iris') then
    v_fail := v_fail || 'I1: rôle Iris administrateur absent';
  end if;

  -- P ------------------------------------------------------------------------
  begin
    insert into public.user_application_access (user_id, application_id, organization_id, role_code)
      values (u_1, 'clara', svc_1, 'administrateur');
    set constraints all immediate;
    v_fail := v_fail || 'P1: administrateur sur un service seul accepté';
  exception when others then
    if sqlstate <> '23514' or sqlerrm not like '%toute la collectivité%' then
      v_fail := v_fail || format('P1: refus inattendu (%s %s)', sqlstate, sqlerrm);
    end if;
  end;
  set constraints all deferred;

  begin
    insert into public.user_application_access (user_id, application_id, organization_id, role_code)
      values (u_1, 'clara', svc_1, 'gestionnaire');
    set constraints all immediate;
  exception when others then
    v_fail := v_fail || format('P2: rôle simple sur un service refusé (%s)', sqlerrm);
  end;
  set constraints all deferred;

  -- O : services d'abord, racine ensuite, dans la même transaction.
  begin
    insert into public.user_application_access (user_id, application_id, organization_id, role_code)
      values (u_2, 'clara', svc_1, 'administrateur'), (u_2, 'clara', svc_2, 'administrateur'),
             (u_2, 'clara', org_a, 'administrateur');
    set constraints all immediate;
  exception when others then
    v_fail := v_fail || format('O1: racine et services posés ensemble refusés (%s)', sqlerrm);
  end;
  set constraints all deferred;

  -- R ------------------------------------------------------------------------
  begin
    update public.user_application_access set role_code = 'gestionnaire'
      where user_id = u_2 and organization_id = org_a;
    set constraints all immediate;
    v_fail := v_fail || 'R1: racine rétrogradée sous des services administrateurs';
  exception when others then
    if sqlstate <> '23514' then v_fail := v_fail || format('R1: refus inattendu (%s)', sqlerrm); end if;
  end;
  set constraints all deferred;

  begin
    update public.user_application_access set is_active = false
      where user_id = u_2 and organization_id = org_a;
    set constraints all immediate;
    v_fail := v_fail || 'R2: racine retirée sous des services administrateurs';
  exception when others then
    if sqlstate <> '23514' then v_fail := v_fail || format('R2: refus inattendu (%s)', sqlerrm); end if;
  end;
  set constraints all deferred;

  begin
    update public.user_application_access set is_active = false where user_id = u_2;
    set constraints all immediate;
  exception when others then
    v_fail := v_fail || format('R3: tout retirer d''un geste refusé (%s)', sqlerrm);
  end;
  set constraints all deferred;

  select string_agg(distinct is_active::text, ',') into v_text from public.user_application_access where user_id = u_2;
  if v_text is distinct from 'false' then v_fail := v_fail || format('R4: état après retrait %s', v_text); end if;

  -- M ------------------------------------------------------------------------
  begin
    insert into public.user_organizations (user_id, organization_id, role) values (u_1, svc_1, 'superviseur');
    v_fail := v_fail || 'M1: rôle Socle inconnu accepté';
  exception when check_violation then null;
  end;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.user_organizations (user_id, organization_id, role) values (u_1, svc_1, 'consultant');
  exception when others then
    v_fail := v_fail || format('M2: l''admin de A ne peut pas ouvrir le Socle sur son service (%s)', sqlerrm);
  end;
  if not exists (select 1 from public.user_organizations where user_id = u_1 and organization_id = svc_1) then
    v_fail := v_fail || 'M3: l''admin de A ne lit pas l''accès Socle posé sur son service';
  end if;
  begin
    insert into public.user_organizations (user_id, organization_id, role) values (u_1, org_b, 'consultant');
    v_fail := v_fail || 'M4: l''admin de A ouvre le Socle chez la voisine';
  exception when insufficient_privilege then null;
  end;
  delete from public.user_organizations where user_id = u_1 and organization_id = svc_1;
  execute 'reset role';
  if exists (select 1 from public.user_organizations where user_id = u_1 and organization_id = svc_1) then
    v_fail := v_fail || 'M5: l''admin de A ne peut pas retirer l''accès Socle de son service';
  end if;

  -- ==========================================================================
  if array_length(v_fail, 1) is null then
    raise exception 'TOUS LES TESTS SONT PASSES (administration d''application sur la racine, Socle) -- transaction annulee.';
  else
    raise exception 'ECHECS (%) : %', array_length(v_fail, 1), array_to_string(v_fail, ' · ');
  end if;
end
$main$;
