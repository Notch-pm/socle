-- ============================================================================
-- Tests de la mesure d'audience du site de démarches.
--
-- Même forme que `provisioning.test.sql` : un bloc `DO` qui se termine par un
-- `raise exception` VOLONTAIRE — rien n'est écrit, aucune donnée ne reste.
--
-- Les règles tenues :
--   1. LA LISTE EXACTE DES COLONNES — c'est LE test de la promesse « aucune
--      donnée personnelle ». Le jour où quelqu'un ajoutera `visitor_id`,
--      `ip_hash`, `user_agent` ou `referrer`, il tombera ici, et il devra
--      relire l'en-tête de la migration avant de le mettre à jour.
--      Motif `plafond-ia.test.sql` (cas Q9) pour le journal de l'IA.
--   2. LES INCRÉMENTS — une seconde vue n'ajoute pas de ligne, une visite ne
--      se compte que si elle est déclarée, un dépôt se pose sur le formulaire.
--   3. L'ISOLATION — une démarche d'une AUTRE racine est ignorée sans rien
--      écrire, et sans lever d'exception (un compteur ne fait pas échouer une
--      page).
--   4. LA GARDE DE LECTURE — un non-membre est refusé, une sous-organisation
--      est refusée, un membre direct de la racine voit tout le sous-arbre.
--   5. LES ÉCRITURES SONT FERMÉES À `authenticated` — sans quoi n'importe quel
--      compte pourrait fabriquer des chiffres.
--
-- Exécution : contexte postgres en lecture-écriture (SQL editor, ou
-- `execute_sql` — l'échec final VOLONTAIRE annule la transaction).
-- ============================================================================

do $main$
declare
  v_fail   text[] := '{}';
  org_a    uuid;   -- racine A (le tenant mesuré)
  org_sub  uuid;   -- sous-organisation de A : elle tient son propre guichet
  org_b    uuid;   -- racine B : son catalogue ne doit jamais entrer chez A
  cat_a    uuid;
  cat_b    uuid;
  proc_a   uuid;
  proc_b   uuid;
  u_member uuid := gen_random_uuid();  -- membre direct de A
  u_other  uuid := gen_random_uuid();  -- étranger à A
  v_int    int;
  v_bool   boolean;
  v_json   jsonb;
  v_cols   text;
  v_day    date := (now() at time zone 'Europe/Paris')::date;
begin
  -- ==========================================================================
  -- R1. LA LISTE EXACTE DES COLONNES — la promesse, rendue vérifiable
  -- ==========================================================================
  select string_agg(column_name, ',' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'portal_audience_pages';
  if v_cols is distinct from 'organization_id,day,page,procedure_id,views,visits,deposits' then
    v_fail := v_fail || ('R1a: colonnes de portal_audience_pages = ' || coalesce(v_cols, 'NULL'));
  end if;

  select string_agg(column_name, ',' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'portal_audience_breakdown';
  if v_cols is distinct from 'organization_id,day,dimension,value,views,visits' then
    v_fail := v_fail || ('R1b: colonnes de portal_audience_breakdown = ' || coalesce(v_cols, 'NULL'));
  end if;

  -- Aucune policy : les tables ne s'atteignent que par les RPC.
  select count(*) into v_int from pg_policies
   where schemaname = 'public'
     and tablename in ('portal_audience_pages', 'portal_audience_breakdown');
  if v_int <> 0 then v_fail := v_fail || format('R1c: %s policy(ies) inattendue(s)', v_int); end if;

  select count(*) into v_int from pg_class
   where relnamespace = 'public'::regnamespace
     and relname in ('portal_audience_pages', 'portal_audience_breakdown')
     and relrowsecurity;
  if v_int <> 2 then v_fail := v_fail || 'R1d: RLS non activé sur les deux tables'; end if;

  -- ==========================================================================
  -- MISE EN PLACE
  -- ==========================================================================
  -- Le provisioning d'une racine pose un plafond IA et un sous-domaine : sans
  -- incidence ici, mais il rappelle que tout INSERT de racine en déclenche un
  -- (voir `provisioning.test.sql`).
  insert into public.users (id, email, global_role) values
    (u_member, 'membre@audience.test', 'user'),
    (u_other,  'autre@audience.test',  'user');

  insert into public.organizations (name, slug) values ('Ville A', 'ville-a-audience')
    returning id into org_a;
  insert into public.organizations (name, slug, parent_id)
    values ('Guichet A', 'guichet-a-audience', org_a) returning id into org_sub;
  insert into public.organizations (name, slug) values ('Ville B', 'ville-b-audience')
    returning id into org_b;

  -- Membre des DEUX : sans l'appartenance au guichet, `organization_dashboard`
  -- y répondrait « Accès refusé » avant même d'atteindre la garde « racine »,
  -- et R4l ne testerait pas ce qu'il prétend tester.
  insert into public.user_organizations (user_id, organization_id, role) values
    (u_member, org_a,   'admin'),
    (u_member, org_sub, 'admin');

  insert into public.categories (organization_id, name) values (org_a, 'Cat A')
    returning id into cat_a;
  insert into public.categories (organization_id, name) values (org_b, 'Cat B')
    returning id into cat_b;
  insert into public.procedures (organization_id, category_id, name, status)
    values (org_a, cat_a, 'Démarche A', 'production') returning id into proc_a;
  insert into public.procedures (organization_id, category_id, name, status)
    values (org_b, cat_b, 'Démarche B', 'production') returning id into proc_b;

  insert into public.organization_procedures (organization_id, procedure_id, is_enabled)
    values (org_sub, proc_a, true);

  -- ==========================================================================
  -- R2. Les incréments
  -- ==========================================================================
  -- Deux arrivées sur l'accueil, puis une navigation interne : 3 vues, 2 visites.
  v_bool := public.record_portal_page_view(org_a, 'accueil', null, true,  'fr', 'ordinateur');
  if not v_bool then v_fail := v_fail || 'R2a: première vue refusée'; end if;
  v_bool := public.record_portal_page_view(org_a, 'accueil', null, true,  'fr', 'mobile');
  v_bool := public.record_portal_page_view(org_a, 'accueil', null, false, 'en', 'mobile');

  select views into v_int from public.portal_audience_pages
   where organization_id = org_a and day = v_day and page = 'accueil';
  if v_int <> 3 then v_fail := v_fail || format('R2b: %s vues au lieu de 3', v_int); end if;
  select visits into v_int from public.portal_audience_pages
   where organization_id = org_a and day = v_day and page = 'accueil';
  if v_int <> 2 then v_fail := v_fail || format('R2c: %s visites au lieu de 2', v_int); end if;

  -- `nulls not distinct` : trois vues de l'accueil, UNE ligne.
  select count(*) into v_int from public.portal_audience_pages
   where organization_id = org_a and page = 'accueil';
  if v_int <> 1 then v_fail := v_fail || format('R2d: %s lignes d''accueil au lieu de 1', v_int); end if;

  -- Ventilations : 2 mobiles, 1 ordinateur ; 2 fr, 1 en.
  select views into v_int from public.portal_audience_breakdown
   where organization_id = org_a and dimension = 'appareil' and value = 'mobile';
  if v_int <> 2 then v_fail := v_fail || format('R2e: %s vues mobiles au lieu de 2', v_int); end if;
  select visits into v_int from public.portal_audience_breakdown
   where organization_id = org_a and dimension = 'langue' and value = 'fr';
  if v_int <> 2 then v_fail := v_fail || format('R2f: %s visites fr au lieu de 2', v_int); end if;

  -- Une langue malformée est IGNORÉE, pas refusée : la vue de page compte
  -- quand même — c'est la ventilation qui perd une ligne, pas la mesure.
  v_bool := public.record_portal_page_view(org_sub, 'demarche', proc_a, false, 'FR_fr!!', 'ordinateur');
  if not v_bool then v_fail := v_fail || 'R2g: vue refusée pour une langue malformée'; end if;
  select count(*) into v_int from public.portal_audience_breakdown
   where organization_id = org_sub and dimension = 'langue';
  if v_int <> 0 then v_fail := v_fail || 'R2h: langue malformée écrite'; end if;

  -- Le formulaire et son dépôt.
  v_bool := public.record_portal_page_view(org_sub, 'formulaire', proc_a, false, 'fr', 'mobile');
  v_bool := public.record_portal_deposit(org_sub, proc_a);
  if not v_bool then v_fail := v_fail || 'R2i: dépôt refusé'; end if;
  select deposits into v_int from public.portal_audience_pages
   where organization_id = org_sub and page = 'formulaire' and procedure_id = proc_a;
  if v_int <> 1 then v_fail := v_fail || format('R2j: %s dépôt(s) au lieu de 1', v_int); end if;
  -- Le dépôt n'ajoute AUCUNE vue : sinon le taux de dépôt dépasserait 100 %.
  select views into v_int from public.portal_audience_pages
   where organization_id = org_sub and page = 'formulaire' and procedure_id = proc_a;
  if v_int <> 1 then v_fail := v_fail || format('R2k: %s vues de formulaire au lieu de 1', v_int); end if;

  -- ==========================================================================
  -- R3. L'isolation — le catalogue d'une autre racine ne rentre pas
  -- ==========================================================================
  v_bool := public.record_portal_page_view(org_a, 'demarche', proc_b, false, 'fr', 'mobile');
  if v_bool then v_fail := v_fail || 'R3a: la démarche d''une autre racine a été comptée'; end if;
  select count(*) into v_int from public.portal_audience_pages
   where organization_id = org_a and procedure_id = proc_b;
  if v_int <> 0 then v_fail := v_fail || 'R3b: ligne écrite pour une démarche étrangère'; end if;

  v_bool := public.record_portal_deposit(org_a, proc_b);
  if v_bool then v_fail := v_fail || 'R3c: dépôt accepté pour une démarche étrangère'; end if;

  -- Une démarche inconnue (supprimée entre-temps) : refusée, sans exception.
  v_bool := public.record_portal_page_view(org_a, 'demarche', gen_random_uuid(), false, 'fr', 'mobile');
  if v_bool then v_fail := v_fail || 'R3d: démarche inconnue comptée'; end if;

  -- Formes impossibles : accueil AVEC démarche, démarche SANS démarche.
  v_bool := public.record_portal_page_view(org_a, 'accueil', proc_a, false, 'fr', 'mobile');
  if v_bool then v_fail := v_fail || 'R3e: accueil accepté avec une démarche'; end if;
  v_bool := public.record_portal_page_view(org_a, 'demarche', null, false, 'fr', 'mobile');
  if v_bool then v_fail := v_fail || 'R3f: démarche acceptée sans démarche'; end if;
  v_bool := public.record_portal_page_view(org_a, 'contact', null, false, 'fr', 'mobile');
  if v_bool then v_fail := v_fail || 'R3g: page inconnue acceptée'; end if;

  -- ==========================================================================
  -- R4. La lecture — un membre direct de la racine voit TOUT le sous-arbre
  -- ==========================================================================
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_member, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_json := public.organization_dashboard(org_a);
  if (v_json #>> '{procedures,total}')::int <> 1 then
    v_fail := v_fail || ('R4a: procedures.total = ' || (v_json #>> '{procedures,total}'));
  end if;
  if (v_json #>> '{procedures,production}')::int <> 1 then
    v_fail := v_fail || 'R4b: procedures.production inattendu';
  end if;
  -- La racine ET son guichet : le sous-arbre, pas la seule racine.
  if jsonb_array_length(v_json -> 'organizations') <> 2 then
    v_fail := v_fail || format('R4c: %s organisation(s) au lieu de 2',
      jsonb_array_length(v_json -> 'organizations'));
  end if;
  select sum((o ->> 'enabled_procedures')::int) into v_int
    from jsonb_array_elements(v_json -> 'organizations') o;
  if v_int <> 1 then v_fail := v_fail || format('R4d: %s activation(s) au lieu de 1', v_int); end if;

  v_json := public.portal_audience(org_a, v_day - 7, v_day);
  -- L'accueil de A (3 vues) + la démarche et le formulaire du guichet (2) = 5.
  if (v_json #>> '{totals,views}')::int <> 5 then
    v_fail := v_fail || ('R4e: totals.views = ' || (v_json #>> '{totals,views}'));
  end if;
  if (v_json #>> '{totals,visits}')::int <> 2 then
    v_fail := v_fail || ('R4f: totals.visits = ' || (v_json #>> '{totals,visits}'));
  end if;
  if (v_json #>> '{totals,deposits}')::int <> 1 then
    v_fail := v_fail || ('R4g: totals.deposits = ' || (v_json #>> '{totals,deposits}'));
  end if;
  if (v_json #>> '{totals,form_views}')::int <> 1 then
    v_fail := v_fail || ('R4h: totals.form_views = ' || (v_json #>> '{totals,form_views}'));
  end if;
  -- La démarche est nommée à la lecture, depuis `procedures`.
  select count(*) into v_int from jsonb_array_elements(v_json -> 'pages') p
   where p ->> 'procedure_name' = 'Démarche A';
  if v_int <> 2 then v_fail := v_fail || format('R4i: %s page(s) nommée(s) au lieu de 2', v_int); end if;
  if jsonb_array_length(v_json -> 'breakdown') < 3 then
    v_fail := v_fail || 'R4j: ventilation incomplète';
  end if;

  -- Une période trop longue est refusée, plutôt que balayée.
  begin
    v_json := public.portal_audience(org_a, v_day - 500, v_day);
    v_fail := v_fail || 'R4k: période de 500 jours acceptée';
  exception when others then
    if sqlerrm not like '%trop longue%' then
      v_fail := v_fail || format('R4k: refusée, message inattendu (%s)', sqlerrm);
    end if;
  end;

  -- Une sous-organisation n'est pas un tableau de bord.
  begin
    v_json := public.organization_dashboard(org_sub);
    v_fail := v_fail || 'R4l: tableau de bord lu sur une sous-organisation';
  exception when others then
    if sqlerrm not like '%principale%' then
      v_fail := v_fail || format('R4l: refusée, message inattendu (%s)', sqlerrm);
    end if;
  end;

  -- ==========================================================================
  -- R5. Les écritures sont fermées à `authenticated`
  -- ==========================================================================
  begin
    v_bool := public.record_portal_page_view(org_a, 'accueil', null, true, 'fr', 'mobile');
    v_fail := v_fail || 'R5a: record_portal_page_view ouverte à authenticated';
  exception when insufficient_privilege then
    null;  -- attendu
  when others then
    v_fail := v_fail || format('R5a: refusée, mais pas pour les droits (%s)', sqlerrm);
  end;

  begin
    v_bool := public.record_portal_deposit(org_a, proc_a);
    v_fail := v_fail || 'R5b: record_portal_deposit ouverte à authenticated';
  exception when insufficient_privilege then
    null;
  when others then
    v_fail := v_fail || format('R5b: refusée, mais pas pour les droits (%s)', sqlerrm);
  end;

  -- Et les tables elles-mêmes restent muettes (RLS sans policy).
  select count(*) into v_int from public.portal_audience_pages;
  if v_int <> 0 then v_fail := v_fail || format('R5c: %s ligne(s) lues en direct', v_int); end if;

  -- ==========================================================================
  -- R6. La garde de lecture — un étranger à la collectivité ne lit rien
  -- ==========================================================================
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  begin
    v_json := public.organization_dashboard(org_a);
    v_fail := v_fail || 'R6a: tableau de bord lu sans droit';
  exception when others then
    if sqlerrm not like '%refusé%' then
      v_fail := v_fail || format('R6a: refusée, message inattendu (%s)', sqlerrm);
    end if;
  end;
  begin
    v_json := public.portal_audience(org_a, v_day - 7, v_day);
    v_fail := v_fail || 'R6b: fréquentation lue sans droit';
  exception when others then
    if sqlerrm not like '%refusé%' then
      v_fail := v_fail || format('R6b: refusée, message inattendu (%s)', sqlerrm);
    end if;
  end;
  execute 'reset role';

  -- ==========================================================================
  -- R7. Le scope `audience` est connu de la contrainte
  -- ==========================================================================
  begin
    insert into public.api_keys (name, key_hash, key_prefix, scopes, consumer, organization_id)
      values ('test audience', 'hash-audience-test', 'sk_test', array['audience'], 'nora', null);
    delete from public.api_keys where key_hash = 'hash-audience-test';
  exception when others then
    v_fail := v_fail || format('R7a: scope audience refusé par la contrainte (%s)', sqlerrm);
  end;

  -- ==========================================================================
  -- VERDICT — puis annulation volontaire
  -- ==========================================================================
  if array_length(v_fail, 1) > 0 then
    raise exception 'ÉCHECS : %', array_to_string(v_fail, ' | ');
  end if;
  raise exception 'OK — audience : toutes les assertions passent (transaction annulée)';
end $main$;
