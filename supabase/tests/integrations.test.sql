-- ============================================================================
-- Tests du catalogue des intégrations partenaires et de leur configuration.
--
-- Même forme que `applications.test.sql` : un bloc `DO` qui se termine par un
-- `raise exception` VOLONTAIRE — rien n'est écrit, aucune donnée ne reste.
--
-- Les règles tenues :
--   1. LE CATALOGUE NE PORTE QU'ARPÈGE — type `application_gru`, application
--      `clara`, adaptateur `arpege` ; aucun partenaire fictif.
--   2. LA CONFIGURATION EST UNE AFFAIRE DE RACINE — refusée sur une
--      sous-organisation.
--   3. SUPER ADMINISTRATEUR SEUL — un administrateur de collectivité ne lit
--      ni n'écrit aucune configuration, pas même la sienne.
--   4. AUCUN CLIENT NE LIT UN SECRET — pas même le super administrateur :
--      privilège refusé (42501), pas un résultat vide trompeur.
--   5. LE CORRECTIF DE SECRETS — valeur = remplace, chaîne vide = conserve,
--      null = efface ; la présence se lit, la valeur jamais ; refusé à un
--      non-super-admin.
--   6. ACTIVER EXIGE UN TEST RÉUSSI — et modifier les paramètres ou un secret
--      invalide le test.
--
-- Exécution : contexte postgres en lecture-écriture (SQL editor, ou
-- `execute_sql` — l'échec final VOLONTAIRE annule la transaction).
-- ============================================================================

do $main$
declare
  v_fail   text[] := '{}';
  org_a    uuid;  org_a_sub uuid;  org_b uuid;
  u_super  uuid := gen_random_uuid();
  u_admin  uuid := gen_random_uuid();
  v_arpege uuid;
  v_conf   uuid;
  v_int    int;
  v_text   text;
  v_keys   text[];
  v_json   jsonb;
  v_bool   boolean;
begin
  -- ==========================================================================
  -- MISE EN PLACE
  -- ==========================================================================
  update public.platform_settings set portal_domain_suffix = null, default_ai_monthly_tokens = null;

  insert into public.users (id, email, global_role) values
    (u_super, 'super@integrations.test', 'super_admin'),
    (u_admin, 'admin@integrations.test', 'user');

  insert into public.organizations (name) values ('Collectivité A') returning id into org_a;
  insert into public.organizations (name, parent_id) values ('Service A', org_a) returning id into org_a_sub;
  insert into public.organizations (name) values ('Collectivité B') returning id into org_b;
  insert into public.user_organizations (user_id, organization_id, role) values (u_admin, org_a, 'admin');

  -- ==========================================================================
  -- I1. Le catalogue ne porte qu'Arpège
  -- ==========================================================================
  select id into v_arpege from public.integrations
  where slug = 'arpege' and type_id = 'application_gru' and adapter = 'arpege' and is_available;
  if v_arpege is null then v_fail := v_fail || 'I1a: Arpège absente ou mal typée'; end if;

  select string_agg(application_id, ',' order by application_id) into v_text
  from public.integration_applications where integration_id = v_arpege;
  if v_text is distinct from 'clara' then
    v_fail := v_fail || format('I1b: applications d''Arpège = %s (attendu : clara)', v_text);
  end if;

  select count(*) into v_int from public.integration_types
  where id in ('parapheur_electronique', 'signature_electronique', 'application_services_techniques', 'application_gru');
  if v_int <> 4 then v_fail := v_fail || format('I1c: %s types sur 4', v_int); end if;

  -- ==========================================================================
  -- I2. La configuration est une affaire de racine
  -- ==========================================================================
  begin
    insert into public.organization_integrations (organization_id, integration_id) values (org_a_sub, v_arpege);
    v_fail := v_fail || 'I2: configuration acceptée sur une sous-organisation';
  exception when others then
    if sqlerrm not like '%organisation principale%' then
      v_fail := v_fail || format('I2: refusée, mais message inattendu (%s)', sqlerrm);
    end if;
  end;

  insert into public.organization_integrations (organization_id, integration_id, settings)
  values (org_a, v_arpege, '{"api_base_url": "https://api.espace-citoyens.net/a"}')
  returning id into v_conf;

  -- ==========================================================================
  -- I3. Super administrateur seul
  -- ==========================================================================
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_int from public.organization_integrations;
  if v_int <> 0 then v_fail := v_fail || 'I3a: un admin de collectivité lit une configuration'; end if;
  begin
    insert into public.organization_integrations (organization_id, integration_id) values (org_b, v_arpege);
    v_fail := v_fail || 'I3b: un admin de collectivité a écrit une configuration';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.organization_integration_secret_keys(org_a);
    v_fail := v_fail || 'I3c: un admin de collectivité lit la présence des secrets';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_organization_integration_secrets(v_conf, '{"client_secret": "x"}');
    v_fail := v_fail || 'I3d: un admin de collectivité a écrit un secret';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  -- ==========================================================================
  -- I4 + I5. Secrets : illisibles, correctif, présence
  -- ==========================================================================
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  perform public.set_organization_integration_secrets(v_conf, '{"client_secret": "s3cret", "access_token": "legacy"}');

  begin
    select count(*) into v_int from public.organization_integration_secrets;
    v_fail := v_fail || 'I4: le super administrateur lit la table des secrets';
  exception when insufficient_privilege then null;
  end;

  -- Chaîne vide = conserve ; null = efface.
  perform public.set_organization_integration_secrets(v_conf, '{"client_secret": "", "access_token": null}');
  select secret_keys into v_keys from public.organization_integration_secret_keys(org_a)
  where organization_integration_id = v_conf;
  if v_keys is distinct from array['client_secret'] then
    v_fail := v_fail || format('I5a: présence = %s (attendu : {client_secret})', v_keys);
  end if;

  begin
    perform public.set_organization_integration_secrets(v_conf, '{"client_secret": 42}');
    v_fail := v_fail || 'I5b: un secret non textuel accepté';
  exception when invalid_parameter_value then null;
  end;
  execute 'reset role';

  select secrets into v_json from public.organization_integration_secrets where organization_integration_id = v_conf;
  if v_json is distinct from '{"client_secret": "s3cret"}'::jsonb then
    v_fail := v_fail || format('I5c: secrets stockés = %s', v_json);
  end if;

  -- ==========================================================================
  -- I6. Activer exige un test réussi ; modifier l'invalide
  -- ==========================================================================
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update public.organization_integrations set is_active = true where id = v_conf;
    v_fail := v_fail || 'I6a: activée sans test';
  exception when check_violation then
    if sqlerrm not like '%Testez la connexion%' then
      v_fail := v_fail || format('I6a: refusée, mais message inattendu (%s)', sqlerrm);
    end if;
  end;
  execute 'reset role';

  -- Le service role (fonction integration-test) écrit un test réussi.
  update public.organization_integrations
  set last_tested_at = now(), last_test_ok = true, last_test_error = null where id = v_conf;

  execute 'set local role authenticated';
  update public.organization_integrations set is_active = true where id = v_conf;
  execute 'reset role';
  select is_active into v_bool from public.organization_integrations where id = v_conf;
  if v_bool is not true then v_fail := v_fail || 'I6b: activation après test réussi refusée'; end if;

  -- Modifier les paramètres invalide le test, sans désactiver.
  update public.organization_integrations
  set settings = '{"api_base_url": "https://api.espace-citoyens.net/b"}' where id = v_conf;
  select last_test_ok into v_bool from public.organization_integrations where id = v_conf;
  if v_bool is not null then v_fail := v_fail || 'I6c: le test survit à un changement de paramètres'; end if;

  -- Changer un secret aussi.
  update public.organization_integrations set last_test_ok = true where id = v_conf;
  execute 'set local role authenticated';
  perform public.set_organization_integration_secrets(v_conf, '{"client_secret": "autre"}');
  execute 'reset role';
  select last_test_ok into v_bool from public.organization_integrations where id = v_conf;
  if v_bool is not null then v_fail := v_fail || 'I6d: le test survit à un changement de secret'; end if;

  -- Un correctif sans changement ne l'invalide pas.
  update public.organization_integrations set last_test_ok = true where id = v_conf;
  execute 'set local role authenticated';
  perform public.set_organization_integration_secrets(v_conf, '{"client_secret": ""}');
  execute 'reset role';
  select last_test_ok into v_bool from public.organization_integrations where id = v_conf;
  if v_bool is not true then v_fail := v_fail || 'I6e: un correctif vide a invalidé le test'; end if;

  -- ==========================================================================
  -- I7. Démarches partenaires : code ⇔ intégration, une par (racine, code)
  -- ==========================================================================
  begin
    insert into public.procedures (organization_id, name, integration_id) values (org_a, 'Sans code', v_arpege);
    v_fail := v_fail || 'I7a: démarche partenaire sans code acceptée';
  exception when check_violation then null;
  end;
  begin
    insert into public.procedures (organization_id, name, external_reference) values (org_a, 'Code seul', 'X1');
    v_fail := v_fail || 'I7b: code sans intégration accepté';
  exception when check_violation then null;
  end;
  insert into public.procedures (organization_id, name, integration_id, external_reference, partner_config)
    values (org_a, 'Voirie', v_arpege, 'VOIRIE', '{"CodeQualificationMetier": "M1"}');
  begin
    insert into public.procedures (organization_id, name, integration_id, external_reference)
      values (org_a, 'Voirie bis', v_arpege, 'VOIRIE');
    v_fail := v_fail || 'I7c: doublon (racine, intégration, code) accepté';
  exception when unique_violation then null;
  end;
  -- Même code chez une autre racine : légitime.
  begin
    insert into public.procedures (organization_id, name, integration_id, external_reference)
      values (org_b, 'Voirie', v_arpege, 'VOIRIE');
  exception when others then
    v_fail := v_fail || format('I7d: même code sur une autre racine refusé (%s)', sqlerrm);
  end;
  begin
    insert into public.procedures (organization_id, name, integration_id, external_reference, partner_config)
      values (org_a, 'Tableau', v_arpege, 'TAB', '[]');
    v_fail := v_fail || 'I7e: partner_config non objet accepté';
  exception when check_violation then null;
  end;

  -- ==========================================================================
  -- I8. Catégories partenaires : code ⇔ intégration, une par (racine, code)
  -- ==========================================================================
  begin
    insert into public.categories (organization_id, name, integration_id) values (org_a, 'Sans code', v_arpege);
    v_fail := v_fail || 'I8a: catégorie partenaire sans code acceptée';
  exception when check_violation then null;
  end;
  insert into public.categories (organization_id, name, integration_id, external_reference)
    values (org_a, 'Actes d''état civil (Arpège)', v_arpege, 'ETATCIVIL');
  begin
    insert into public.categories (organization_id, name, integration_id, external_reference)
      values (org_a, 'Doublon', v_arpege, 'ETATCIVIL');
    v_fail := v_fail || 'I8b: doublon de catégorie partenaire accepté';
  exception when unique_violation then null;
  end;

  -- ==========================================================================
  -- VERDICT — puis annulation volontaire
  -- ==========================================================================
  if array_length(v_fail, 1) > 0 then
    raise exception 'ÉCHECS : %', array_to_string(v_fail, ' | ');
  end if;
  raise exception 'OK — intégrations : toutes les assertions passent (transaction annulée)';
end $main$;
