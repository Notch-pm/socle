-- ============================================================================
-- Tests du courrier libre du portail (`portal_free_mail_settings`).
--
-- Même forme que `applications.test.sql` : un bloc `DO` qui se termine par un
-- `raise exception` VOLONTAIRE — rien n'est écrit, aucune donnée ne reste.
--
-- Les règles tenues :
--   1. TOUTE ORGANISATION — une sous-organisation a sa propre ligne.
--   2. LE TITRE EST BORNÉ — 1 à 80 caractères une fois trimé, ou NULL.
--   3. L'ADMINISTRATEUR D'UN ANCÊTRE ÉCRIT ; un simple membre ne le peut pas ;
--      un administrateur d'une autre collectivité ne voit rien.
--   4. LES APPLICATIONS DE LA RACINE se lisent depuis une sous-organisation
--      (`organization_root_applications`), et pas depuis une autre collectivité.
--   5. `courrier` EST UN SLUG RÉSERVÉ.
--
-- Exécution : contexte postgres en lecture-écriture (SQL editor, ou
-- `execute_sql` — l'échec final VOLONTAIRE annule la transaction).
-- ============================================================================

do $main$
declare
  v_fail   text[] := '{}';
  org_a    uuid;  org_a_sub uuid;  org_b uuid;
  u_admin  uuid := gen_random_uuid();
  u_member uuid := gen_random_uuid();
  u_other  uuid := gen_random_uuid();
  v_int    int;
  v_apps   text[];
begin
  -- ==========================================================================
  -- MISE EN PLACE
  -- ==========================================================================
  update public.platform_settings set portal_domain_suffix = null, default_ai_monthly_tokens = null;

  insert into public.users (id, email, global_role) values
    (u_admin, 'admin@courrier.test', 'user'),
    (u_member, 'membre@courrier.test', 'user'),
    (u_other, 'autre@courrier.test', 'user');

  insert into public.organizations (name) values ('Collectivité A') returning id into org_a;
  insert into public.organizations (name, parent_id) values ('Service A', org_a) returning id into org_a_sub;
  insert into public.organizations (name) values ('Collectivité B') returning id into org_b;

  insert into public.user_organizations (user_id, organization_id, role) values
    (u_admin, org_a, 'admin'),
    (u_member, org_a_sub, 'member'),
    (u_other, org_b, 'admin');

  insert into public.organization_applications (organization_id, application_id) values
    (org_a, 'nora'), (org_a, 'clara');

  -- ==========================================================================
  -- R2. Le titre est borné
  -- ==========================================================================
  begin
    insert into public.portal_free_mail_settings (organization_id, enabled, title) values (org_b, true, '   ');
    v_fail := v_fail || 'R2a: un titre blanc a été accepté';
  exception when check_violation then null;
  end;
  begin
    insert into public.portal_free_mail_settings (organization_id, enabled, title) values (org_b, true, repeat('x', 81));
    v_fail := v_fail || 'R2b: un titre de 81 caractères a été accepté';
  exception when check_violation then null;
  end;

  -- ==========================================================================
  -- R1 + R3. L'administrateur de la racine règle une sous-organisation
  -- ==========================================================================
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.portal_free_mail_settings (organization_id, enabled, title)
    values (org_a_sub, true, 'Écrire au service');
  execute 'reset role';
  select count(*) into v_int from public.portal_free_mail_settings where organization_id = org_a_sub and enabled;
  if v_int <> 1 then v_fail := v_fail || 'R3a: l''administrateur de la racine ne peut pas régler une sous-organisation'; end if;

  -- Un simple membre lit, mais n'écrit pas.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_member, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_int from public.portal_free_mail_settings where organization_id = org_a_sub;
  if v_int <> 1 then v_fail := v_fail || 'R3b: un membre ne lit pas le réglage de son organisme'; end if;
  update public.portal_free_mail_settings set enabled = false where organization_id = org_a_sub;
  execute 'reset role';
  select count(*) into v_int from public.portal_free_mail_settings where organization_id = org_a_sub and enabled;
  if v_int <> 1 then v_fail := v_fail || 'R3c: un simple membre a fermé le courrier libre'; end if;

  -- Un administrateur d'une autre collectivité ne voit rien.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_int from public.portal_free_mail_settings where organization_id = org_a_sub;
  if v_int <> 0 then v_fail := v_fail || 'R3d: une autre collectivité lit le réglage'; end if;

  -- ==========================================================================
  -- R4. Les applications de la racine
  -- ==========================================================================
  v_apps := public.organization_root_applications(org_a_sub);
  if v_apps <> '{}'::text[] then v_fail := v_fail || 'R4a: une autre collectivité lit les abonnements'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_member, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_apps := public.organization_root_applications(org_a_sub);
  execute 'reset role';
  if not ('nora' = any (v_apps) and 'clara' = any (v_apps)) then
    v_fail := v_fail || 'R4b: la sous-organisation ne lit pas les abonnements de sa racine';
  end if;

  if public.organization_root_id(org_a_sub) <> org_a or public.organization_root_id(org_a) <> org_a then
    v_fail := v_fail || 'R4c: organization_root_id ne remonte pas à la racine';
  end if;

  -- ==========================================================================
  -- R5. `courrier` est réservé
  -- ==========================================================================
  begin
    update public.organizations set slug = 'courrier' where id = org_a_sub;
    v_fail := v_fail || 'R5: le slug « courrier » a été accepté';
  exception when check_violation then null;
  end;

  -- ==========================================================================
  -- VERDICT — puis annulation volontaire
  -- ==========================================================================
  if array_length(v_fail, 1) > 0 then
    raise exception 'ÉCHECS : %', array_to_string(v_fail, ' | ');
  end if;
  raise exception 'OK — courrier libre : toutes les assertions passent (transaction annulée)';
end $main$;
