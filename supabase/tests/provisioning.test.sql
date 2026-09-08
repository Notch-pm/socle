-- ============================================================================
-- Tests du provisioning d'une organisation principale (racine).
--
-- Même forme que `plafond-ia.test.sql` : un bloc `DO` qui se termine par un
-- `raise exception` VOLONTAIRE — rien n'est écrit, aucune donnée ne reste.
--
-- Les règles tenues :
--   1. UNE RACINE NAÎT ÉQUIPÉE — rôles de contact, plafond IA par défaut,
--      sous-domaine fourni, dès l'INSERT, quel que soit le chemin de création.
--   2. UNE SOUS-ORGANISATION NE REÇOIT RIEN — le provisioning est une affaire
--      de collectivité, pas de service.
--   3. IDEMPOTENT — rejouer ne double rien (`provision_existing_roots` s'y fie).
--   4. JAMAIS BLOQUANT — slug vide, hostname déjà pris : l'organisation se
--      crée quand même, sans sous-domaine.
--   5. LE LABEL DNS EST DÉRIVÉ, PAS RECOPIÉ — accents, ponctuation, longueur.
--      Miroir TS `dnsLabelFromSlug` : mêmes cas, mêmes résultats.
--   6. PROMOUVOIR UN SERVICE EN RACINE L'ÉQUIPE — et réécrire parent_id sur
--      une racine ne rejoue rien.
--   7. LA CHECK-LIST LIT CE QUI EST — `root_onboarding_status`, gardée
--      (super admin ou admin de la racine), refusée sur une sous-organisation.
--
-- Exécution : contexte postgres en lecture-écriture (SQL editor, ou
-- `execute_sql` — l'échec final VOLONTAIRE annule la transaction).
-- ============================================================================

do $main$
declare
  v_fail  text[] := '{}';
  org_a   uuid;   -- racine avec slug accentué
  org_sub uuid;   -- sous-organisation de A, promue racine en fin de test
  org_b   uuid;   -- racine sans slug
  org_c   uuid;   -- racine dont le sous-domaine est déjà pris
  u_super uuid := gen_random_uuid();
  u_other uuid := gen_random_uuid();
  v_int   int;
  v_text  text;
  v_json  jsonb;
begin
  -- ==========================================================================
  -- MISE EN PLACE — les réglages de plateforme
  -- ==========================================================================
  update public.platform_settings
     set portal_domain_suffix = '  Demarches.Test-Edilumen.fr. ',
         default_ai_monthly_tokens = 1500000;
  select portal_domain_suffix into v_text from public.platform_settings;
  if v_text <> 'demarches.test-edilumen.fr' then
    v_fail := v_fail || ('S1: suffixe non normalisé : ' || coalesce(v_text, 'NULL'));
  end if;

  insert into public.users (id, email, global_role) values
    (u_super, 'super@prov.test', 'super_admin'),
    (u_other, 'other@prov.test', 'user');

  -- ==========================================================================
  -- R1. Une racine naît équipée
  -- ==========================================================================
  insert into public.organizations (name, slug)
    values ('Sète Agglopôle', 'Sète Agglopôle') returning id into org_a;

  select count(*) into v_int from public.contact_roles where organization_id = org_a;
  if v_int <> 8 then v_fail := v_fail || format('R1a: %s rôles au lieu de 8', v_int); end if;

  select count(*) into v_int from public.ai_usage_quotas
   where organization_id = org_a and provider = '__global__'
     and monthly_limit_tokens = 1500000 and is_active;
  if v_int <> 1 then v_fail := v_fail || 'R1b: plafond par défaut absent'; end if;

  select hostname into v_text from public.organization_domains
   where organization_id = org_a and is_primary;
  if v_text is distinct from 'sete-agglopole.demarches.test-edilumen.fr' then
    v_fail := v_fail || ('R1c: sous-domaine ' || coalesce(v_text, 'NULL'));
  end if;

  -- ==========================================================================
  -- R2. Une sous-organisation ne reçoit rien
  -- ==========================================================================
  insert into public.organizations (name, slug, parent_id)
    values ('Service X', 'service-x', org_a) returning id into org_sub;
  select count(*) into v_int from public.contact_roles where organization_id = org_sub;
  if v_int <> 0 then v_fail := v_fail || 'R2a: rôles posés sur une sous-organisation'; end if;
  select count(*) into v_int from public.organization_domains where organization_id = org_sub;
  if v_int <> 0 then v_fail := v_fail || 'R2b: sous-domaine posé sur une sous-organisation'; end if;

  -- ==========================================================================
  -- R3. Idempotent
  -- ==========================================================================
  v_json := public.provision_root(org_a);
  if (v_json->>'roles')::int <> 0 or (v_json->>'quota')::boolean or v_json->>'domain' is not null then
    v_fail := v_fail || ('R3: rejouer a écrit quelque chose : ' || v_json::text);
  end if;
  select count(*) into v_int from public.organization_domains where organization_id = org_a;
  if v_int <> 1 then v_fail := v_fail || format('R3b: %s domaines après rejeu', v_int); end if;

  -- ==========================================================================
  -- R4. Jamais bloquant
  -- ==========================================================================
  -- Sans slug : pas de sous-domaine, mais rôles et plafond quand même.
  insert into public.organizations (name, slug) values ('Sans slug', null) returning id into org_b;
  select count(*) into v_int from public.organization_domains where organization_id = org_b;
  if v_int <> 0 then v_fail := v_fail || 'R4a: sous-domaine attribué sans slug'; end if;
  select count(*) into v_int from public.contact_roles where organization_id = org_b;
  if v_int <> 8 then v_fail := v_fail || 'R4b: rôles absents sans slug'; end if;

  -- Hostname déjà pris par une autre collectivité : l'organisation se crée,
  -- sans sous-domaine (le trigger avertit, il n'échoue pas).
  insert into public.organization_domains (organization_id, hostname, is_primary)
    values (org_b, 'doublon.demarches.test-edilumen.fr', false);
  insert into public.organizations (name, slug) values ('Doublon', 'Doublon') returning id into org_c;
  select count(*) into v_int from public.organization_domains where organization_id = org_c;
  if v_int <> 0 then v_fail := v_fail || 'R4c: sous-domaine attribué malgré la collision'; end if;
  select count(*) into v_int from public.contact_roles where organization_id = org_c;
  if v_int <> 8 then v_fail := v_fail || 'R4d: rôles absents après collision'; end if;

  -- ==========================================================================
  -- R5. Le label DNS — mêmes cas que `dnsLabelFromSlug` côté TS
  -- ==========================================================================
  if public.dns_label_from_slug('  Sète--Agglopôle ! ') <> 'sete-agglopole' then
    v_fail := v_fail || ('R5a: ' || public.dns_label_from_slug('  Sète--Agglopôle ! '));
  end if;
  if public.dns_label_from_slug('Aix-en-Provence') <> 'aix-en-provence' then v_fail := v_fail || 'R5b'; end if;
  if public.dns_label_from_slug('L''Isle-sur-la-Sorgue') <> 'l-isle-sur-la-sorgue' then v_fail := v_fail || 'R5c'; end if;
  if public.dns_label_from_slug('---') is not null then v_fail := v_fail || 'R5d: ponctuation seule'; end if;
  if public.dns_label_from_slug(null) is not null then v_fail := v_fail || 'R5e: null'; end if;
  if length(public.dns_label_from_slug(repeat('a', 70))) <> 63 then v_fail := v_fail || 'R5f: longueur'; end if;
  -- Une coupe à 63 qui tombe sur un tiret ne laisse pas de tiret final.
  if public.dns_label_from_slug(repeat('a', 62) || '-b') <> repeat('a', 62) then v_fail := v_fail || 'R5g: tiret de coupe'; end if;
  if public.dns_label_from_slug('Mairie de Cahors') <> 'mairie-de-cahors' then v_fail := v_fail || 'R5h'; end if;

  -- ==========================================================================
  -- R6. Promotion et réécriture
  -- ==========================================================================
  update public.organizations set parent_id = null where id = org_sub;
  select count(*) into v_int from public.contact_roles where organization_id = org_sub;
  if v_int <> 8 then v_fail := v_fail || 'R6a: service promu sans rôles'; end if;
  select count(*) into v_int from public.organization_domains
   where organization_id = org_sub and hostname = 'service-x.demarches.test-edilumen.fr' and is_primary;
  if v_int <> 1 then v_fail := v_fail || 'R6b: service promu sans sous-domaine'; end if;

  -- Réécrire parent_id (à null) sur une racine : rien ne bouge.
  update public.organizations set parent_id = null where id = org_a;
  select count(*) into v_int from public.organization_domains where organization_id = org_a;
  if v_int <> 1 then v_fail := v_fail || 'R6c: réécriture a rejoué le domaine'; end if;

  -- ==========================================================================
  -- R7. La check-list
  -- ==========================================================================
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_json := public.root_onboarding_status(org_a);
  if (v_json->>'contact_role_count')::int <> 8 then v_fail := v_fail || 'R7a: rôles'; end if;
  if (v_json->>'domain_count')::int <> 1 then v_fail := v_fail || 'R7b: domaines'; end if;
  if not (v_json->>'ai_quota_decided')::boolean or not (v_json->>'ai_quota_active')::boolean then
    v_fail := v_fail || 'R7c: plafond';
  end if;
  if (v_json->>'smtp_configured')::boolean then v_fail := v_fail || 'R7d: smtp'; end if;
  if (v_json->>'admin_count')::int <> 0 or (v_json->>'category_count')::int <> 0 then
    v_fail := v_fail || 'R7e: compteurs';
  end if;
  if (v_json->>'portal_published')::boolean or (v_json->>'logo_present')::boolean then
    v_fail := v_fail || 'R7f: drapeaux';
  end if;

  -- Sous-organisation : refusée (org_sub est devenue racine, on en recrée une).
  execute 'reset role';
  insert into public.organizations (name, slug, parent_id) values ('Service Y', 'service-y', org_a) returning id into org_sub;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    v_json := public.root_onboarding_status(org_sub);
    v_fail := v_fail || 'R7g: lue sur une sous-organisation';
  exception when others then
    if sqlerrm not like '%organisation principale%' then
      v_fail := v_fail || format('R7g: refusée, mais message inattendu (%s)', sqlerrm);
    end if;
  end;

  -- Un utilisateur sans droit : refusé.
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    v_json := public.root_onboarding_status(org_a);
    v_fail := v_fail || 'R7h: lue sans droit';
  exception when others then
    if sqlerrm not like '%refusé%' then
      v_fail := v_fail || format('R7h: refusée, mais message inattendu (%s)', sqlerrm);
    end if;
  end;

  -- Et le rejeu global est réservé au super administrateur.
  begin
    v_json := public.provision_existing_roots();
    v_fail := v_fail || 'R8: provision_existing_roots ouverte à un utilisateur ordinaire';
  exception when others then
    if sqlerrm not like '%super administrateur%' then
      v_fail := v_fail || format('R8: refusée, mais message inattendu (%s)', sqlerrm);
    end if;
  end;
  execute 'reset role';

  -- ==========================================================================
  -- VERDICT — puis annulation volontaire
  -- ==========================================================================
  if array_length(v_fail, 1) > 0 then
    raise exception 'ÉCHECS : %', array_to_string(v_fail, ' | ');
  end if;
  raise exception 'OK — provisioning : toutes les assertions passent (transaction annulée)';
end $main$;
