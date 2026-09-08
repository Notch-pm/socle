-- ============================================================================
-- Tests du registre des applications et des abonnements.
--
-- Même forme que `plafond-ia.test.sql` : un bloc `DO` qui se termine par un
-- `raise exception` VOLONTAIRE — rien n'est écrit, aucune donnée ne reste.
--
-- Les règles tenues :
--   1. LE PÉRIMÈTRE D'UNE CLÉ PLATEFORME EST L'ABONNEMENT — les sous-arbres
--      des racines abonnées à son application, rien d'autre.
--   2. LE SOCLE VOIT TOUT — une application de scope `plateforme` sert toutes
--      les organisations.
--   3. UNE APPLICATION INCONNUE NE VOIT RIEN.
--   4. L'ABONNEMENT EST UNE AFFAIRE DE RACINE — refusé sur une sous-organisation.
--   5. LE REGISTRE GARDE LES CLÉS — consumer inconnu refusé, clé plateforme
--      vivante sans application refusée, scope inconnu refusé.
--   6. SOUSCRIRE EST RÉSERVÉ AU SUPER ADMINISTRATEUR (RLS).
--
-- Exécution : contexte postgres en lecture-écriture (SQL editor, ou
-- `execute_sql` — l'échec final VOLONTAIRE annule la transaction).
-- ============================================================================

do $main$
declare
  v_fail  text[] := '{}';
  org_a   uuid;  org_a_sub uuid;  org_b uuid;  org_c uuid;
  u_super uuid := gen_random_uuid();
  u_admin uuid := gen_random_uuid();
  v_ids   uuid[];
  v_int   int;
begin
  -- ==========================================================================
  -- MISE EN PLACE
  -- ==========================================================================
  -- Le provisioning ne doit pas attribuer de sous-domaines ici.
  update public.platform_settings set portal_domain_suffix = null, default_ai_monthly_tokens = null;

  insert into public.users (id, email, global_role) values
    (u_super, 'super@apps.test', 'super_admin'),
    (u_admin, 'admin@apps.test', 'user');

  insert into public.organizations (name) values ('Collectivité A') returning id into org_a;
  insert into public.organizations (name, parent_id) values ('Service A', org_a) returning id into org_a_sub;
  insert into public.organizations (name) values ('Collectivité B') returning id into org_b;
  insert into public.organizations (name) values ('Collectivité C') returning id into org_c;

  insert into public.applications (id, name, scope) values ('app-test', 'Application de test', 'abonnement');

  insert into public.organization_applications (organization_id, application_id) values (org_a, 'app-test');
  insert into public.organization_applications (organization_id, application_id) values (org_b, 'app-test');

  -- ==========================================================================
  -- R1. Le périmètre est l'abonnement
  -- ==========================================================================
  v_ids := public.application_scope_ids('app-test');
  if not (org_a = any (v_ids) and org_a_sub = any (v_ids) and org_b = any (v_ids)) then
    v_fail := v_fail || 'R1a: racines abonnées (et sous-arbre) absentes du périmètre';
  end if;
  if org_c = any (v_ids) then
    v_fail := v_fail || 'R1b: une racine NON abonnée est dans le périmètre';
  end if;
  if array_length(v_ids, 1) <> 3 then
    v_fail := v_fail || format('R1c: %s organisations au lieu de 3', array_length(v_ids, 1));
  end if;

  -- Résilier retire du périmètre.
  delete from public.organization_applications where organization_id = org_b and application_id = 'app-test';
  v_ids := public.application_scope_ids('app-test');
  if org_b = any (v_ids) then v_fail := v_fail || 'R1d: résiliation sans effet'; end if;

  -- ==========================================================================
  -- R2. Le Socle voit tout · R3. Une inconnue ne voit rien
  -- ==========================================================================
  v_ids := public.application_scope_ids('socle');
  if not (org_a = any (v_ids) and org_b = any (v_ids) and org_c = any (v_ids) and org_a_sub = any (v_ids)) then
    v_fail := v_fail || 'R2: le scope plateforme ne voit pas tout';
  end if;
  v_ids := public.application_scope_ids('inconnue');
  if coalesce(array_length(v_ids, 1), 0) <> 0 then
    v_fail := v_fail || 'R3: une application inconnue voit quelque chose';
  end if;

  -- ==========================================================================
  -- R4. L'abonnement est une affaire de racine
  -- ==========================================================================
  begin
    insert into public.organization_applications (organization_id, application_id) values (org_a_sub, 'app-test');
    v_fail := v_fail || 'R4: abonnement accepté sur une sous-organisation';
  exception when others then
    if sqlerrm not like '%organisation principale%' then
      v_fail := v_fail || format('R4: refusé, mais message inattendu (%s)', sqlerrm);
    end if;
  end;

  -- ==========================================================================
  -- R5. Le registre garde les clés
  -- ==========================================================================
  begin
    insert into public.api_keys (organization_id, name, key_prefix, key_hash, scopes, consumer)
      values (null, 'Fantôme', 'sk_test_f', 'hash-f-' || gen_random_uuid()::text, array['read'], 'fantome');
    v_fail := v_fail || 'R5a: consumer inconnu accepté';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.api_keys (organization_id, name, key_prefix, key_hash, scopes, consumer)
      values (null, 'Sans app', 'sk_test_s', 'hash-s-' || gen_random_uuid()::text, array['read'], null);
    v_fail := v_fail || 'R5b: clé plateforme vivante sans application acceptée';
  exception when check_violation then null;
  end;

  -- Une clé plateforme RÉVOQUÉE sans application reste tolérée (elle est morte).
  begin
    insert into public.api_keys (organization_id, name, key_prefix, key_hash, scopes, consumer, revoked_at)
      values (null, 'Morte', 'sk_test_m', 'hash-m-' || gen_random_uuid()::text, array['read'], null, now());
  exception when others then
    v_fail := v_fail || format('R5c: clé révoquée sans application refusée (%s)', sqlerrm);
  end;

  begin
    insert into public.api_keys (organization_id, name, key_prefix, key_hash, scopes, consumer)
      values (org_a, 'Scope inconnu', 'sk_test_x', 'hash-x-' || gen_random_uuid()::text, array['read', 'admin'], null);
    v_fail := v_fail || 'R5d: scope inconnu accepté';
  exception when check_violation then null;
  end;

  -- Une clé LIÉE sans application reste valide (un partenaire).
  begin
    insert into public.api_keys (organization_id, name, key_prefix, key_hash, scopes, consumer)
      values (org_a, 'Partenaire', 'sk_test_p', 'hash-p-' || gen_random_uuid()::text, array['read'], null);
  exception when others then
    v_fail := v_fail || format('R5e: clé liée sans application refusée (%s)', sqlerrm);
  end;

  -- ==========================================================================
  -- R6. Souscrire est réservé au super administrateur
  -- ==========================================================================
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.organization_applications (organization_id, application_id) values (org_c, 'app-test');
    v_fail := v_fail || 'R6a: un utilisateur ordinaire a souscrit';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  select count(*) into v_int from public.organization_applications where organization_id = org_c;
  if v_int <> 0 then v_fail := v_fail || 'R6a: la souscription refusée a pourtant été écrite'; end if;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.organization_applications (organization_id, application_id) values (org_c, 'app-test');
  execute 'reset role';
  select count(*) into v_int from public.organization_applications where organization_id = org_c;
  if v_int <> 1 then v_fail := v_fail || 'R6b: le super administrateur ne peut pas souscrire'; end if;

  -- Et la check-list compte les applications.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if (public.root_onboarding_status(org_c)->>'application_count')::int <> 1 then
    v_fail := v_fail || 'R6c: la check-list ne compte pas les applications';
  end if;
  execute 'reset role';

  -- ==========================================================================
  -- VERDICT — puis annulation volontaire
  -- ==========================================================================
  if array_length(v_fail, 1) > 0 then
    raise exception 'ÉCHECS : %', array_to_string(v_fail, ' | ');
  end if;
  raise exception 'OK — applications : toutes les assertions passent (transaction annulée)';
end $main$;
