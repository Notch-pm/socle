-- ============================================================================
-- Tests de l'annuaire des agents et de leurs accès aux applications
-- (migrations `annuaire_agents_acces` et `api_users_scope`, 2026-10-30).
--
-- Même motif que `plafond-ia.test.sql` : un bloc `DO` qui finit par un
-- `raise exception` volontaire s'annule lui-même et ne laisse aucune donnée.
--
-- Les règles tenues :
--   A. UN ACCÈS SUPPOSE L'ABONNEMENT de la racine, et un rôle que
--      l'application déclare.
--   R. LE PÉRIMÈTRE EST CELUI DE L'ÉCRAN DES UTILISATEURS — l'admin d'une
--      racine gère tout son sous-arbre, rien chez la voisine ; il lit l'agent
--      qui n'a d'accès qu'à d'autres applications ; il ne SUPPRIME jamais un
--      accès (la lecture incrémentale de /v1/users ne le verrait pas).
--   U. `users` N'EST INSCRIPTIBLE QUE SUR PRÉNOM ET NOM — la faille
--      `global_role` (corrigée le 2026-10-30) ne revient pas.
--   S. LA SUSPENSION VAUT POUR TOUTE LA GAMME — donc elle exige un
--      périmètre qui couvre TOUS les rattachements de l'agent ; jamais
--      soi-même ; lignes d'accès conservées.
--
-- ⚠️ Chaque refus vérifie le MESSAGE (ou le SQLSTATE), jamais
-- `when others then null`.
--
-- Exécution : contexte postgres (SQL editor, ou `execute_sql`) — l'échec
-- final VOLONTAIRE annule la transaction.
-- ============================================================================

do $main$
declare
  org_a   uuid;   -- collectivité A, abonnée à Clara
  org_sub uuid;   -- sous-organisation de A
  org_b   uuid;   -- collectivité B, abonnée à Clara, PAS à Iris
  u_admin  uuid := gen_random_uuid();   -- administrateur de A
  u_agent  uuid := gen_random_uuid();   -- agent de A, Clara seulement
  u_shared uuid := gen_random_uuid();   -- agent de A ET de B
  v_fail text[] := '{}';
  v_int int; v_text text; v_ts timestamptz;
begin
  -- ==========================================================================
  -- MISE EN PLACE
  -- ==========================================================================
  update public.platform_settings set default_ai_monthly_tokens = null, portal_domain_suffix = null;

  insert into public.users (id, email, global_role) values
    (u_admin,  'admin@agents.test',  'consultant'),
    (u_agent,  'agent@agents.test',  'consultant'),
    (u_shared, 'shared@agents.test', 'consultant');

  insert into public.organizations (name, parent_id) values ('Collectivité A', null) returning id into org_a;
  insert into public.organizations (name, parent_id) values ('Service A', org_a)   returning id into org_sub;
  insert into public.organizations (name, parent_id) values ('Collectivité B', null) returning id into org_b;

  -- Les racines créées après le 2026-09-08 sont opt-in : abonnements explicites.
  delete from public.organization_applications where organization_id in (org_a, org_b);
  insert into public.organization_applications (organization_id, application_id) values
    (org_a, 'clara'), (org_b, 'clara');

  insert into public.user_organizations (user_id, organization_id, role) values (u_admin, org_a, 'admin');

  -- ==========================================================================
  -- A. Abonnement et rôle
  -- ==========================================================================
  begin
    insert into public.user_application_access (user_id, application_id, organization_id, role_code)
      values (u_agent, 'iris', org_b, 'agent');
    v_fail := v_fail || 'A1: accès Iris posé sur une collectivité non abonnée'::text;
  exception when others then
    if sqlerrm not like '%pas abonnée%' then
      v_fail := v_fail || format('A1: refusé, mais message inattendu (%s)', sqlerrm); end if; end;

  begin
    insert into public.user_application_access (user_id, application_id, organization_id, role_code)
      values (u_agent, 'clara', org_sub, 'directeur');
    v_fail := v_fail || 'A2: rôle inconnu de Clara accepté'::text;
  exception when foreign_key_violation then null; end;

  -- Un accès sur une SOUS-organisation : l'abonnement est celui de la racine.
  insert into public.user_application_access (user_id, application_id, organization_id, role_code)
    values (u_shared, 'clara', org_b, 'elu');

  -- ==========================================================================
  -- R. Périmètre de l'administrateur de A
  -- ==========================================================================
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    insert into public.user_application_access (user_id, application_id, organization_id, role_code)
      values (u_agent, 'clara', org_sub, 'gestionnaire');
  exception when others then
    v_fail := v_fail || format('R1: l''admin de A ne peut pas ouvrir Clara sur sa sous-organisation (%s)', sqlerrm); end;

  begin
    insert into public.user_application_access (user_id, application_id, organization_id, role_code)
      values (u_agent, 'clara', org_b, 'gestionnaire');
    v_fail := v_fail || 'R2: l''admin de A a ouvert un accès chez B'::text;
  exception when insufficient_privilege then
    if sqlerrm not like '%row-level security%' then
      v_fail := v_fail || format('R2: refusé, mais message inattendu (%s)', sqlerrm); end if; end;

  -- L'agent n'a d'accès qu'à Clara : l'admin le lit quand même.
  select count(*) into v_int from public.users where id = u_agent;
  if v_int <> 1 then v_fail := v_fail || 'R3: l''admin ne lit pas un agent sans accès Socle'::text; end if;

  -- L'admin de A ne voit pas l'accès de u_shared chez B.
  select count(*) into v_int from public.user_application_access where user_id = u_shared;
  if v_int <> 0 then v_fail := v_fail || 'R4: l''admin de A lit un accès de B'::text; end if;

  begin
    delete from public.user_application_access where user_id = u_agent;
    v_fail := v_fail || 'R5: un accès a été supprimé (il se désactive)'::text;
  exception when insufficient_privilege then null; end;

  update public.user_application_access set is_active = false where user_id = u_agent and organization_id = org_sub;
  get diagnostics v_int = row_count;
  if v_int <> 1 then v_fail := v_fail || 'R6: l''admin ne peut pas retirer (désactiver) un accès'::text; end if;

  -- ==========================================================================
  -- U. `users` : prénom et nom seulement
  -- ==========================================================================
  begin
    update public.users set global_role = 'super_admin' where id = u_admin;
    v_fail := v_fail || 'U1: un compte a écrit son propre global_role'::text;
  exception when insufficient_privilege then null; end;

  begin
    update public.users set status = 'active' where id = u_agent;
    v_fail := v_fail || 'U2: status écrit sans passer par set_user_status'::text;
  exception when insufficient_privilege then null; end;

  update public.users set first_name = 'Alice' where id = u_agent;
  get diagnostics v_int = row_count;
  if v_int <> 1 then v_fail := v_fail || 'U3: l''admin ne peut plus renommer un agent de son organisme'::text; end if;

  -- ==========================================================================
  -- S. Suspension
  -- ==========================================================================
  begin
    perform public.set_user_status(u_admin, 'suspended');
    v_fail := v_fail || 'S1: un administrateur s''est suspendu lui-même'::text;
  exception when others then
    if sqlerrm not like '%propre statut%' then
      v_fail := v_fail || format('S1: refusé, mais message inattendu (%s)', sqlerrm); end if; end;

  execute 'reset role';
  insert into public.user_application_access (user_id, application_id, organization_id, role_code)
    values (u_shared, 'clara', org_a, 'consultant');
  execute 'set local role authenticated';

  begin
    perform public.set_user_status(u_shared, 'suspended');
    v_fail := v_fail || 'S2: un agent partagé avec B a été suspendu depuis A'::text;
  exception when others then
    if sqlerrm not like '%hors de votre périmètre%' then
      v_fail := v_fail || format('S2: refusé, mais message inattendu (%s)', sqlerrm); end if; end;

  begin
    perform public.set_user_status(u_agent, 'suspended');
  exception when others then
    v_fail := v_fail || format('S3: l''admin de A ne peut pas suspendre son agent (%s)', sqlerrm); end;
  execute 'reset role';

  select status, updated_at into v_text, v_ts from public.users where id = u_agent;
  if v_text is distinct from 'suspended' then v_fail := v_fail || format('S4: statut %s', v_text); end if;
  select count(*) into v_int from public.user_application_access where user_id = u_agent;
  if v_int <> 1 then v_fail := v_fail || format('S5: %s lignes d''accès après suspension (1 attendue)', v_int); end if;

  -- ==========================================================================
  if array_length(v_fail, 1) is null then
    raise exception 'TOUS LES TESTS SONT PASSES (annuaire des agents, Socle) -- transaction annulee.';
  else
    raise exception 'ECHECS (%) : %', array_length(v_fail, 1), array_to_string(v_fail, ' · ');
  end if;
end
$main$;
