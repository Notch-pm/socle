-- ============================================================================
-- Tests du plafond d'utilisation IA.
--
-- ⚠️ PREMIER TEST SQL VERSIONNÉ DU SOCLE. Le projet n'a pas de framework de
-- test SQL, et il n'en faut pas : un bloc `DO` qui se termine par un
-- `raise exception` volontaire s'annule lui-même, ne laisse aucune donnée, et
-- se lit sans outillage. Ce n'était pas une raison pour jeter les 24
-- assertions déjà éprouvées côté Iris (migration 20260828170100) au moment de
-- porter la comptabilité ici.
--
-- Les six règles tenues :
--   1. LE REFUS N'INCRÉMENTE RIEN — l'UPDATE conditionnel de reserve_ai_usage
--      est la porte de concurrence. 0 ligne ⇒ refus, compteur inchangé,
--      fournisseur jamais appelé.
--   2. UN ÉCHEC N'EST JAMAIS FACTURÉ — settle('failed'/'timeout') libère la
--      réservation sans toucher `used_tokens`.
--   3. LE RÈGLEMENT EST IDEMPOTENT — un second settle ne double rien.
--   4. L'ÉCRITURE N'A QU'UNE PORTE — set_ai_usage_quota, réservée au SUPER
--      ADMIN. Aucune policy d'écriture cliente sur les trois tables.
--   5. 🆕 L'APPLICATION DISCRIMINE LE JOURNAL, JAMAIS LE COMPTEUR — deux
--      consommateurs, un seul compteur, deux lignes de journal imputées.
--      C'est LA règle du modèle centralisé.
--   6. LE SCHÉMA EST LA PREUVE DU PASSE-PLAT — l'ensemble des colonnes
--      d'`ai_usage_events` est épinglé : une future colonne `prompt`,
--      `content` ou `answer` casse ce test au lieu de passer inaperçue.
--   8. 🆕 LA PART D'UNE APPLICATION EST RÉSERVÉE, ET LE RESTE SE PARTAGE
--      (2026-09-20, partage 2026-09-22) — sans part rien ne change ; une part
--      borne SON application ET les applications sans part au reste du
--      plafond ; un refus du plafond commun lui REND sa réservation ; elle
--      borne même une collectivité sans plafond, en jetons (section S).
--   9. 🆕 LE POURCENTAGE EST VIVANT, ET LES CAS LIMITES SONT INOFFENSIFS
--      (2026-09-22) — relever le plafond fait suivre la part ; un pourcentage
--      sans plafond est sans effet ; une part en jetons au-delà du plafond s'y
--      borne ; la borne des autres n'est jamais négative (section T).
--   7. 🆕 LE GARDE-FOU DE DÉBIT COMPTE LES TENTATIVES, PAS LES SUCCÈS — c'est
--      la règle qui coupe une boucle que le plafond refuse déjà (R3), et c'est
--      elle qui permet de vérifier la porte SANS dépenser un jeton.
--
-- ⚠️ Chaque refus vérifie le MESSAGE de l'erreur, jamais `exception when
-- others then null` : sinon un « permission denied » passe pour un refus
-- légitime.
--
-- Exécution : contexte postgres en lecture-écriture (SQL editor du dashboard,
-- ou `apply_migration` — l'échec final VOLONTAIRE annule la transaction).
-- ============================================================================

do $main$
declare
  org_a   uuid;   -- collectivité A (racine)
  org_sub uuid;   -- sous-organisation de A — ne doit pas pouvoir porter de plafond
  org_b   uuid;   -- collectivité B (racine)
  u_super uuid := gen_random_uuid();
  u_admin uuid := gen_random_uuid();
  key_iris  uuid;
  key_clara uuid;
  ev1 uuid; ev2 uuid; ev3 uuid;
  v_fail text[] := '{}';
  v_period text := to_char((now() at time zone 'utc'), 'YYYY-MM');
  v_prev   text := to_char((now() at time zone 'utc') - interval '1 month', 'YYYY-MM');
  r record;
  v_int int; v_big bigint; v_big2 bigint; v_bool boolean; v_text text; v_arr text[];
  -- Garde-fou de débit (2026-08-29)
  org_r uuid;   -- collectivité avec un plafond confortable
  org_n uuid;   -- collectivité SANS plafond — celle qui n'a aucune borne
  org_x uuid;   -- collectivité dont le plafond est déjà épuisé
  a_1 uuid := gen_random_uuid();
  a_2 uuid := gen_random_uuid();
  a_3 uuid := gen_random_uuid();
  v_i int;
  v_win timestamptz := date_trunc('minute', now());
  -- Sous-plafond par application (2026-09-20)
  org_s  uuid;  -- collectivité avec un plafond commun ET un sous-plafond pour nora
  org_s2 uuid;  -- collectivité SANS plafond commun, mais avec un sous-plafond
  key_nora uuid;
  ev_n uuid;
  -- Partage du plafond (2026-09-22)
  org_t  uuid;  -- plafond commun ET part en jetons pour nora
  org_t2 uuid;  -- plafond commun ET part en pourcentage
  ev_i uuid;
begin
  -- ==========================================================================
  -- MISE EN PLACE
  -- ==========================================================================
  -- Le provisioning (2026-09-08) poserait un plafond par défaut aux racines
  -- créées ci-dessous, dont org_n, qui doit rester SANS plafond. Neutralisé
  -- ici — annulé avec la transaction, comme tout le reste.
  update public.platform_settings set default_ai_monthly_tokens = null, portal_domain_suffix = null;

  insert into public.users (id, email, global_role) values
    (u_super, 'super@o.test', 'super_admin'),
    (u_admin, 'admin@o.test', 'user');

  insert into public.organizations (name, parent_id) values ('Collectivité A', null) returning id into org_a;
  insert into public.organizations (name, parent_id) values ('Service A', org_a)   returning id into org_sub;
  insert into public.organizations (name, parent_id) values ('Collectivité B', null) returning id into org_b;

  insert into public.api_keys (organization_id, name, key_prefix, key_hash, scopes, consumer)
    values (org_a, 'Iris', 'sk_test_i', 'hash-iris-' || gen_random_uuid()::text, array['ai'], 'iris')
    returning id into key_iris;
  insert into public.api_keys (organization_id, name, key_prefix, key_hash, scopes, consumer)
    values (org_a, 'Clara', 'sk_test_c', 'hash-clara-' || gen_random_uuid()::text, array['ai'], 'clara')
    returning id into key_clara;

  -- ==========================================================================
  -- Q0. Le motif transverse : un plafond se pose sur une RACINE
  -- ==========================================================================
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.set_ai_usage_quota(org_sub, 1000);
    v_fail := v_fail || 'Q0a: un plafond a ete pose sur une sous-organisation'::text;
  exception when others then
    if sqlerrm not like '%organisation principale%' then
      v_fail := v_fail || format('Q0a: refuse, mais message inattendu (%s)', sqlerrm);
    end if; end;
  execute 'reset role';

  -- ==========================================================================
  -- Q1. Aucun plafond ⇒ illimité, et AUCUN compteur n'est créé
  -- ==========================================================================
  select * into r from public.reserve_ai_usage(org_a, 'mistral', 'chat', 500, 'iris', key_iris);
  if not r.allowed or r.reason is distinct from 'no_quota_configured' then
    v_fail := v_fail || format('Q1a: sans plafond, allowed=%s reason=%s', r.allowed, r.reason); end if;
  if r.event_id is null then v_fail := v_fail || 'Q1b: aucun evenement journalise'::text; end if;
  -- ⚠️ `usage_period`, pas `period` : une sortie homonyme d'une colonne rendrait
  -- le nom ambigu dans `on conflict`. Régression trouvée par ce test même.
  if r.usage_period is distinct from v_period then
    v_fail := v_fail || format('Q1c: periode %s au lieu de %s', r.usage_period, v_period); end if;
  if r.renews_at is null then v_fail := v_fail || 'Q1d: renews_at absent'::text; end if;
  select count(*) into v_int from public.ai_usage_counters where organization_id = org_a;
  if v_int <> 0 then v_fail := v_fail || format('Q1e: %s compteur(s) sans plafond', v_int); end if;
  select counter_provider into v_text from public.ai_usage_events where id = r.event_id;
  if v_text is not null then v_fail := v_fail || format('Q1f: counter_provider=%s', v_text); end if;
  perform public.settle_ai_usage(r.event_id, 400, 'completed');
  select count(*) into v_int from public.ai_usage_counters where organization_id = org_a;
  if v_int <> 0 then v_fail := v_fail || 'Q1g: le reglement a cree un compteur hors plafond'::text; end if;

  -- Un consommateur vide est refusé : une dépense doit être imputable.
  begin
    perform public.reserve_ai_usage(org_a, 'mistral', 'chat', 10, '  ', key_iris);
    v_fail := v_fail || 'Q1h: un consommateur vide a ete accepte'::text;
  exception when others then
    if sqlerrm not like '%imputable%' then
      v_fail := v_fail || format('Q1h: refuse, message inattendu (%s)', sqlerrm);
    end if; end;

  -- ==========================================================================
  -- Q2. Plafond posé : la réservation qui dépasse est REFUSÉE sans incrément
  -- ==========================================================================
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_ai_usage_quota(org_a, 1000);
  execute 'reset role';

  select * into r from public.reserve_ai_usage(org_a, 'mistral', 'chat', 600, 'iris', key_iris);
  if not r.allowed or r.reason is distinct from 'ok' then
    v_fail := v_fail || format('Q2a: premiere reservation refusee (%s)', r.reason); end if;
  ev1 := r.event_id;
  select * into r from public.reserve_ai_usage(org_a, 'mistral', 'chat', 600, 'iris', key_iris);
  if r.allowed or r.reason is distinct from 'quota_exceeded' then
    v_fail := v_fail || format('Q2b: depassement accepte (allowed=%s)', r.allowed); end if;
  if r.event_id is not null then v_fail := v_fail || 'Q2c: un refus a laisse une ligne'::text; end if;
  select used_tokens, reserved_tokens into v_big, v_big2 from public.ai_usage_counters
   where organization_id = org_a and provider = '__global__' and period = v_period;
  if v_big <> 0 or v_big2 <> 600 then
    v_fail := v_fail || format('Q2d: compteur %s/%s apres refus, attendu 0/600', v_big, v_big2); end if;

  -- ==========================================================================
  -- Q3/Q4/Q5. Règlement réel, échec non facturé, idempotence
  -- ==========================================================================
  perform public.settle_ai_usage(ev1, 480, 'completed');
  select used_tokens, reserved_tokens into v_big, v_big2 from public.ai_usage_counters
   where organization_id = org_a and provider = '__global__' and period = v_period;
  if v_big <> 480 or v_big2 <> 0 then
    v_fail := v_fail || format('Q3a: compteur %s/%s, attendu 480/0', v_big, v_big2); end if;

  select * into r from public.reserve_ai_usage(org_a, 'mistral', 'chat', 300, 'iris', key_iris);
  ev2 := r.event_id;
  perform public.settle_ai_usage(ev2, null, 'failed');
  select used_tokens, reserved_tokens into v_big, v_big2 from public.ai_usage_counters
   where organization_id = org_a and provider = '__global__' and period = v_period;
  if v_big <> 480 or v_big2 <> 0 then
    v_fail := v_fail || format('Q4a: compteur %s/%s apres echec, attendu 480/0', v_big, v_big2); end if;
  select actual_tokens into v_big from public.ai_usage_events where id = ev2;
  if v_big is not null then v_fail := v_fail || format('Q4b: actual_tokens=%s sur echec', v_big); end if;

  select * into r from public.reserve_ai_usage(org_a, 'mistral', 'chat', 100, 'iris', key_iris);
  ev3 := r.event_id;
  perform public.settle_ai_usage(ev3, 100, 'completed');
  perform public.settle_ai_usage(ev3, 100, 'completed');
  select used_tokens into v_big from public.ai_usage_counters
   where organization_id = org_a and provider = '__global__' and period = v_period;
  if v_big <> 580 then
    v_fail := v_fail || format('Q5a: used=%s apres double reglement, attendu 580', v_big); end if;

  -- ==========================================================================
  -- Q6. Le filet : une réservation orpheline est soldée en timeout
  -- ==========================================================================
  select * into r from public.reserve_ai_usage(org_a, 'mistral', 'chat', 200, 'iris', key_iris);
  update public.ai_usage_events set created_at = now() - interval '20 minutes' where id = r.event_id;
  select public.release_stale_ai_reservations(15) into v_int;
  if v_int <> 1 then v_fail := v_fail || format('Q6a: %s liberee(s), attendu 1', v_int); end if;
  select status into v_text from public.ai_usage_events where id = r.event_id;
  if v_text is distinct from 'timeout' then v_fail := v_fail || format('Q6b: statut %s', v_text); end if;
  select used_tokens, reserved_tokens into v_big, v_big2 from public.ai_usage_counters
   where organization_id = org_a and provider = '__global__' and period = v_period;
  if v_big <> 580 or v_big2 <> 0 then
    v_fail := v_fail || format('Q6c: compteur %s/%s apres timeout, attendu 580/0', v_big, v_big2); end if;
  select * into r from public.reserve_ai_usage(org_a, 'mistral', 'chat', 50, 'iris', key_iris);
  select public.release_stale_ai_reservations(15) into v_int;
  if v_int <> 0 then v_fail := v_fail || format('Q6d: balayage a emporte %s fraiche(s)', v_int); end if;
  perform public.settle_ai_usage(r.event_id, 50, 'completed');

  -- ==========================================================================
  -- Q7. RÉGRESSION CLARA : deux enregistrements ⇒ UNE ligne de plafond
  -- ==========================================================================
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_ai_usage_quota(org_a, 5000);
  perform public.set_ai_usage_quota(org_a, 7000);
  execute 'reset role';
  select count(*) into v_int from public.ai_usage_quotas
   where organization_id = org_a and provider = '__global__';
  if v_int <> 1 then
    v_fail := v_fail || format('Q7a: %s lignes de plafond au lieu de 1 (ON CONFLICT inoperant)', v_int); end if;

  -- ==========================================================================
  -- Q8 🆕. L'APPLICATION DISCRIMINE LE JOURNAL, JAMAIS LE COMPTEUR
  -- La règle du modèle centralisé : Iris et Clara puisent au MÊME seau, et le
  -- journal seul sait qui a dépensé quoi.
  -- ==========================================================================
  select * into r from public.reserve_ai_usage(org_a, 'mistral', 'chat', 111, 'clara', key_clara, 'ocr-courrier');
  perform public.settle_ai_usage(r.event_id, 111, 'completed');
  select * into r from public.reserve_ai_usage(org_a, 'mistral', 'agent', 222, 'iris', key_iris, 'assistant-instruction');
  perform public.settle_ai_usage(r.event_id, 222, 'completed');

  select count(*) into v_int from public.ai_usage_counters
   where organization_id = org_a and period = v_period;
  if v_int <> 1 then
    v_fail := v_fail || format('Q8a: %s compteur(s) pour la collectivite, attendu 1 (le plafond est global)', v_int); end if;
  select used_tokens into v_big from public.ai_usage_counters
   where organization_id = org_a and provider = '__global__' and period = v_period;
  if v_big <> 963 then  -- 580 + 50 + 111 + 222
    v_fail := v_fail || format('Q8b: used=%s, attendu 963 (les deux applications au meme seau)', v_big); end if;

  select count(distinct consumer) into v_int from public.ai_usage_events
   where organization_id = org_a and status = 'completed';
  if v_int <> 2 then
    v_fail := v_fail || format('Q8c: %s consommateur(s) au journal, attendu 2', v_int); end if;

  -- La ventilation dit qui a dépensé quoi.
  select tokens into v_big from public.ai_usage_breakdown(org_a, v_period) where consumer = 'clara';
  if v_big is distinct from 111::bigint then
    v_fail := v_fail || format('Q8d: ventilation clara = %s, attendu 111', v_big); end if;
  select tokens into v_big from public.ai_usage_breakdown(org_a, v_period)
   where consumer = 'iris' and feature = 'assistant-instruction';
  if v_big is distinct from 222::bigint then
    v_fail := v_fail || format('Q8e: ventilation iris/assistant = %s, attendu 222', v_big); end if;

  -- ==========================================================================
  -- Q9 🆕. LE SCHÉMA EST LA PREUVE DU PASSE-PLAT
  -- Aucune colonne ne peut contenir un prompt ni une réponse. Une liste
  -- POSITIVE : une colonne ajoutée demain casse ce test, là où une liste
  -- d'interdits ne peut qu'oublier un cas.
  -- ==========================================================================
  select array_agg(column_name order by column_name) into v_arr
    from information_schema.columns
   where table_schema = 'public' and table_name = 'ai_usage_events';
  if v_arr is distinct from array[
      'actual_tokens','api_key_id','consumer','consumer_counted','counter_provider','created_at',
      'estimated_tokens','external_actor_id','external_ref_id','external_ref_kind',
      'feature','id','organization_id','period','provider','resource_type',
      'settled_at','status'] then
    v_fail := v_fail || format(
      'Q9a: les colonnes du journal ont change (%s). Si une colonne de TEXTE a ete ajoutee, le passe-plat est rompu.',
      array_to_string(v_arr, ','));
  end if;

  -- ==========================================================================
  -- Q10. La période précédente n'influe pas sur la période courante
  -- ==========================================================================
  insert into public.ai_usage_counters (organization_id, provider, period, used_tokens)
    values (org_a, '__global__', v_prev, 999999);
  select * into r from public.reserve_ai_usage(org_a, 'mistral', 'chat', 100, 'iris', key_iris);
  if not r.allowed then
    v_fail := v_fail || 'Q10a: un compteur du mois precedent a bloque le mois courant'::text; end if;
  perform public.settle_ai_usage(r.event_id, 100, 'completed');

  -- ==========================================================================
  -- R. LE GARDE-FOU DE DÉBIT 🆕 (2026-08-29)
  --
  -- Le plafond mensuel dit COMBIEN, jamais À QUELLE VITESSE. Ces assertions
  -- portent la porte qui manquait, et surtout la décision qui la structure :
  -- elle compte les TENTATIVES.
  -- ==========================================================================
  insert into public.organizations (name, parent_id) values ('Collectivité R', null) returning id into org_r;
  insert into public.organizations (name, parent_id) values ('Collectivité N', null) returning id into org_n;
  insert into public.organizations (name, parent_id) values ('Collectivité X', null) returning id into org_x;
  insert into public.ai_usage_quotas (organization_id, provider, monthly_limit_tokens)
       values (org_r, '__global__', 1000000),
              (org_x, '__global__', 1);

  -- R1. Vingt tentatives d'un agent passent ; la vingt-et-unième est coupée.
  for v_i in 1..20 loop
    select * into r from public.reserve_ai_usage(org_r, 'mistral', 'chat', 10, 'iris', key_iris, null, null, null, a_1);
    if not r.allowed then
      v_fail := v_fail || format('R1a: tentative %s refusee (%s)', v_i, r.reason); end if;
  end loop;
  select * into r from public.reserve_ai_usage(org_r, 'mistral', 'chat', 10, 'iris', key_iris, null, null, null, a_1);
  if r.allowed or r.reason is distinct from 'rate_limited' then
    v_fail := v_fail || format('R1b: la 21e tentative est passee (allowed=%s, %s)', r.allowed, r.reason); end if;

  -- R2. Un refus de cadence ne laisse AUCUNE ligne de journal, et ne parle pas
  -- du crédit : remplir les compteurs laisserait croire que le plafond est en
  -- cause, alors que le crédit est intact.
  if r.event_id is not null then
    v_fail := v_fail || 'R2a: un refus de cadence a laisse une ligne de journal'::text; end if;
  if r.limit_tokens is not null or r.used_tokens is not null or r.reserved_tokens is not null then
    v_fail := v_fail || 'R2b: un refus de cadence a rempli les compteurs de jetons'::text; end if;
  select count(*) into v_int from public.ai_usage_events
   where organization_id = org_r and external_actor_id = a_1;
  if v_int <> 20 then
    v_fail := v_fail || format('R2c: %s lignes de journal pour 20 appels acceptes', v_int); end if;

  -- R3. ⚠️ L'ASSERTION QUI PORTE TOUT : un refus de PLAFOND compte quand même
  -- comme tentative. Sans elle, une boucle que le plafond refuse martèlerait
  -- jusqu'à la fin du mois sans jamais être coupée — et le garde-fou serait
  -- inutile précisément là où il sert.
  for v_i in 1..5 loop
    select * into r from public.reserve_ai_usage(org_x, 'mistral', 'chat', 10, 'iris', key_iris, null, null, null, a_3);
    if r.allowed or r.reason is distinct from 'quota_exceeded' then
      v_fail := v_fail || format('R3a: appel %s non refuse par le plafond (%s)', v_i, r.reason); end if;
  end loop;
  select attempts into v_int from public.ai_usage_rate
   where organization_id = org_x and subject_kind = 'actor' and subject = a_3::text
     and bucket = 'chat' and window_start = v_win;
  if v_int is distinct from 5 then
    v_fail := v_fail || format('R3b: %s tentatives comptees pour 5 refus de plafond, attendu 5', v_int); end if;

  -- R4. Un autre agent de la MÊME collectivité n'est pas affecté : la porte est
  -- par agent, pas par collectivité.
  select * into r from public.reserve_ai_usage(org_r, 'mistral', 'chat', 10, 'iris', key_iris, null, null, null, a_2);
  if not r.allowed then
    v_fail := v_fail || format('R4: un autre agent est bloque par le quota d''un premier (%s)', r.reason); end if;

  -- R5. Le MÊME agent dans une autre collectivité n'est pas affecté.
  select * into r from public.reserve_ai_usage(org_n, 'mistral', 'chat', 10, 'iris', key_iris, null, null, null, a_1);
  if not r.allowed or r.reason is distinct from 'no_quota_configured' then
    v_fail := v_fail || format('R5: le compteur de debit fuit entre collectivites (%s)', r.reason); end if;

  -- R6. ⚠️ LA PORTE S'APPLIQUE À UNE COLLECTIVITÉ SANS PLAFOND. Ce sont
  -- justement celles qui n'ont aucune borne aujourd'hui, et le `return`
  -- anticipé « aucun plafond ⇒ illimité » les ferait échapper à toute garde
  -- placée plus bas dans la fonction.
  insert into public.ai_usage_rate (organization_id, subject_kind, subject, bucket, window_start, attempts)
       values (org_n, 'actor', a_2::text, 'chat', v_win, 20);
  select * into r from public.reserve_ai_usage(org_n, 'mistral', 'chat', 10, 'iris', key_iris, null, null, null, a_2);
  if r.allowed or r.reason is distinct from 'rate_limited' then
    v_fail := v_fail || format('R6: une collectivite sans plafond echappe au debit (%s)', r.reason); end if;

  -- R7. Sans identifiant d'agent, la porte bascule sur l'APPLICATION, avec sa
  -- limite propre (plus haute : elle couvre alors toute une collectivité).
  select attempts into v_int from public.ai_usage_rate
   where organization_id = org_x and subject_kind = 'consumer' and subject = 'iris'
     and bucket = 'chat' and window_start = v_win;
  if v_int is not null then
    v_fail := v_fail || 'R7a: un appel AVEC agent a aussi compte sur l''application'::text; end if;
  insert into public.ai_usage_rate (organization_id, subject_kind, subject, bucket, window_start, attempts)
       values (org_x, 'consumer', 'iris', 'chat', v_win, 120);
  select * into r from public.reserve_ai_usage(org_x, 'mistral', 'chat', 10, 'iris', key_iris);
  if r.allowed or r.reason is distinct from 'rate_limited' then
    v_fail := v_fail || format('R7b: le filet par application ne coupe pas (%s)', r.reason); end if;

  -- R8. Une fenêtre écoulée ne pèse pas sur la fenêtre courante : le passage à
  -- la minute suivante crée une ligne neuve, sans reset destructif.
  insert into public.ai_usage_rate (organization_id, subject_kind, subject, bucket, window_start, attempts)
       values (org_r, 'actor', a_2::text, 'chat', v_win - interval '5 minutes', 20);
  select * into r from public.reserve_ai_usage(org_r, 'mistral', 'chat', 10, 'iris', key_iris, null, null, null, a_2);
  if not r.allowed then
    v_fail := v_fail || format('R8: une fenetre passee bloque la fenetre courante (%s)', r.reason); end if;

  -- R9. La purge retire ce qui est HORS RÉTENTION, et rien d'autre.
  --
  -- ⚠️ « Écoulée » ne veut pas dire « purgeable » : la fenêtre de R8, vieille de
  -- 5 minutes, doit SURVIVRE à une rétention d'une heure. La première écriture
  -- de ce test l'attendait supprimée — c'était l'assertion qui avait tort, pas
  -- la purge. Une rétention qui ne garderait que la minute courante ferait
  -- perdre toute mémoire du débit au premier passage du balayage.
  insert into public.ai_usage_rate (organization_id, subject_kind, subject, bucket, window_start, attempts)
       values (org_r, 'actor', gen_random_uuid()::text, 'chat', v_win - interval '3 hours', 7);
  select public.purge_ai_usage_rate(60) into v_int;
  if v_int <> 1 then
    v_fail := v_fail || format('R9a: la purge a retire %s fenetre(s), attendu 1 (la seule hors retention)', v_int); end if;
  select count(*) into v_int from public.ai_usage_rate where window_start = v_win;
  if v_int = 0 then
    v_fail := v_fail || 'R9b: la purge a emporte la fenetre courante'::text; end if;
  select count(*) into v_int from public.ai_usage_rate
   where window_start = v_win - interval '5 minutes';
  if v_int <> 1 then
    v_fail := v_fail || 'R9c: la purge a emporte une fenetre encore dans la retention'::text; end if;
  select count(*) into v_int from public.ai_usage_rate
   where window_start < now() - interval '60 minutes';
  if v_int <> 0 then
    v_fail := v_fail || format('R9d: %s fenetre(s) hors retention subsistent', v_int); end if;

  -- R10. La table et la purge sont fermées aux clients : la RPC est l'unique
  -- porte, comme pour les trois autres tables.
  select has_table_privilege('authenticated', 'public.ai_usage_rate', 'insert') into v_bool;
  if v_bool then v_fail := v_fail || 'R10a: authenticated a INSERT sur ai_usage_rate'::text; end if;
  select has_function_privilege('authenticated', 'public.purge_ai_usage_rate(int)', 'execute') into v_bool;
  if v_bool then v_fail := v_fail || 'R10b: authenticated peut purge_ai_usage_rate'::text; end if;
  -- Le revoke ne doit pas emporter la LECTURE : sans elle, la policy super
  -- admin ne servirait plus a rien et le diagnostic « pourquoi ai-je ete
  -- freine ? » deviendrait impossible.
  select has_table_privilege('authenticated', 'public.ai_usage_rate', 'select') into v_bool;
  if not v_bool then v_fail := v_fail || 'R10c: authenticated a perdu le SELECT'::text; end if;


  -- R11 🆕. UN SEUIL PAR NATURE D'APPEL, ET DES SEAUX SÉPARÉS
  --
  -- Le seuil de 20 a été calibré sur un humain qui pose des questions. L'OCR
  -- est du traitement de LOT : 20 documents/minute couperait un lot de courrier
  -- légitime. Et différencier la limite sans séparer le compteur laisserait ce
  -- lot manger le budget de QUESTIONS du même agent.
  -- ==========================================================================
  -- L'agent a_1 a déjà épuisé son seau conversationnel dans org_r (R1). Son
  -- seau de LOT doit être intact : c'est toute la démonstration.
  select * into r from public.reserve_ai_usage(org_r, 'mistral', 'ocr', 10, 'clara', key_iris, null, null, null, a_1);
  if not r.allowed then
    v_fail := v_fail || format('R11a: un lot est bloque par le seau conversationnel du meme agent (%s)', r.reason); end if;

  -- Et le seuil du lot est bien le seuil HAUT : on l'amène à 59 tentatives.
  update public.ai_usage_rate set attempts = 59
   where organization_id = org_r and subject_kind = 'actor' and subject = a_1::text
     and bucket = 'batch' and window_start = v_win;
  select * into r from public.reserve_ai_usage(org_r, 'mistral', 'ocr', 10, 'clara', key_iris, null, null, null, a_1);
  if not r.allowed then
    v_fail := v_fail || format('R11b: la 60e tentative de lot est refusee (%s)', r.reason); end if;
  select * into r from public.reserve_ai_usage(org_r, 'mistral', 'ocr', 10, 'clara', key_iris, null, null, null, a_1);
  if r.allowed or r.reason is distinct from 'rate_limited' then
    v_fail := v_fail || format('R11c: la 61e tentative de lot est passee (%s)', r.reason); end if;

  -- Deux lignes distinctes pour le même agent, une par nature.
  select count(*) into v_int from public.ai_usage_rate
   where organization_id = org_r and subject_kind = 'actor' and subject = a_1::text
     and window_start = v_win;
  if v_int <> 2 then
    v_fail := v_fail || format('R11d: %s seau(x) pour un agent, attendu 2 (chat et batch)', v_int); end if;

  -- ⚠️ Un type INCONNU retombe sur le seuil conversationnel, le plus strict :
  -- sur un garde-fou de coût, l'inconnu se bride, il ne se libère pas.
  update public.ai_usage_rate set attempts = 20
   where organization_id = org_r and subject_kind = 'actor' and subject = a_1::text
     and bucket = 'chat' and window_start = v_win;
  select * into r from public.reserve_ai_usage(org_r, 'mistral', 'nouveau-type', 10, 'clara', key_iris, null, null, null, a_1);
  if r.allowed or r.reason is distinct from 'rate_limited' then
    v_fail := v_fail || format('R11e: un type inconnu a obtenu le seuil de lot (%s)', r.reason); end if;

  -- ==========================================================================
  -- E1. Étanchéité : le super admin voit tout, un utilisateur ordinaire rien
  -- ==========================================================================
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_ai_usage_quota(org_b, 4242);
  select count(*) into v_int from public.ai_usage_quotas;
  if v_int < 2 then v_fail := v_fail || format('E1a: le super admin ne voit que %s plafond(s)', v_int); end if;
  execute 'reset role';

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_int from public.ai_usage_quotas;
  if v_int <> 0 then v_fail := v_fail || format('E1b: un utilisateur ordinaire voit %s plafond(s)', v_int); end if;
  select count(*) into v_int from public.ai_usage_events;
  if v_int <> 0 then v_fail := v_fail || format('E1c: un utilisateur ordinaire voit %s evenement(s)', v_int); end if;

  -- ==========================================================================
  -- E2. Aucune écriture cliente, même pour un super admin
  -- ==========================================================================
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.ai_usage_quotas (organization_id, monthly_limit_tokens) values (org_a, 99999);
    v_fail := v_fail || 'E2a: INSERT client accepte'::text;
  exception when insufficient_privilege then null;
  when others then v_fail := v_fail || format('E2a: refus inattendu (%s / %s)', sqlstate, sqlerrm); end;
  begin
    update public.ai_usage_counters set used_tokens = 0 where organization_id = org_a;
    v_fail := v_fail || 'E2b: UPDATE client accepte'::text;
  exception when insufficient_privilege then null;
  when others then v_fail := v_fail || format('E2b: refus inattendu (%s / %s)', sqlstate, sqlerrm); end;

  -- ==========================================================================
  -- E3. La porte de réglage est réservée au SUPER ADMIN
  -- ==========================================================================
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.set_ai_usage_quota(org_a, 123456);
    v_fail := v_fail || 'E3a: un utilisateur ordinaire a pu regler le plafond'::text;
  exception when others then
    if sqlerrm not like '%super administrateur%' then
      v_fail := v_fail || format('E3a: message inattendu (%s)', sqlerrm); end if; end;
  begin
    perform public.delete_ai_usage_quota(org_a);
    v_fail := v_fail || 'E3b: un utilisateur ordinaire a pu retirer le plafond'::text;
  exception when others then
    if sqlerrm not like '%super administrateur%' then
      v_fail := v_fail || format('E3b: message inattendu (%s)', sqlerrm); end if; end;
  execute 'reset role';
  select monthly_limit_tokens into v_big from public.ai_usage_quotas
   where organization_id = org_a and provider = '__global__';
  if v_big is distinct from 7000::bigint then
    v_fail := v_fail || format('E3c: plafond %s apres refus, attendu 7000', v_big); end if;

  -- ==========================================================================
  -- E4. Le cycle d'appel est fermé aux clients
  -- ==========================================================================
  select has_function_privilege('authenticated',
    'public.reserve_ai_usage(uuid,text,text,bigint,text,uuid,text,text,uuid,uuid)', 'execute') into v_bool;
  if v_bool then v_fail := v_fail || 'E4a: authenticated peut reserve_ai_usage'::text; end if;
  select has_function_privilege('authenticated',
    'public.settle_ai_usage(uuid,bigint,text)', 'execute') into v_bool;
  if v_bool then v_fail := v_fail || 'E4b: authenticated peut settle_ai_usage'::text; end if;
  select has_function_privilege('authenticated',
    'public.release_stale_ai_reservations(int)', 'execute') into v_bool;
  if v_bool then v_fail := v_fail || 'E4c: authenticated peut release_stale'::text; end if;
  select has_table_privilege('authenticated', 'public.ai_usage_events', 'insert') into v_bool;
  if v_bool then v_fail := v_fail || 'E4d: authenticated a INSERT sur ai_usage_events'::text; end if;

  -- ==========================================================================
  -- S. LA PART RÉSERVÉE D'UNE APPLICATION 🆕 (2026-09-20, partage 2026-09-22)
  --
  -- L'assistant du portail usagers (nora) est ouvert à des visiteurs anonymes :
  -- sans borne propre, il peut épuiser le crédit dont les agents ont besoin.
  -- Depuis le 2026-09-22, sa borne est une PART RÉSERVÉE du plafond : les
  -- applications sans part se partagent le reste, et y sont bornées.
  -- ==========================================================================
  insert into public.organizations (name, parent_id) values ('Collectivité S', null)  returning id into org_s;
  insert into public.organizations (name, parent_id) values ('Collectivité S2', null) returning id into org_s2;
  insert into public.ai_usage_quotas (organization_id, provider, monthly_limit_tokens)
       values (org_s, '__global__', 10000);
  insert into public.api_keys (organization_id, name, key_prefix, key_hash, scopes, consumer)
    values (null, 'Nora IA', 'sk_test_n', 'hash-nora-' || gen_random_uuid()::text, array['ai'], 'nora')
    returning id into key_nora;

  -- S0. Une part se pose sur une RACINE, comme le plafond.
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.set_ai_usage_consumer_quota(org_sub, 'nora', 1000);
    v_fail := v_fail || 'S0a: une part a ete posee sur une sous-organisation'::text;
  exception when others then
    if sqlerrm not like '%organisation principale%' then
      v_fail := v_fail || format('S0a: refuse, mais message inattendu (%s)', sqlerrm);
    end if; end;
  begin
    perform public.set_ai_usage_consumer_quota(org_s, 'appli-inconnue', 1000);
    v_fail := v_fail || 'S0b: une part a ete posee pour une application hors registre'::text;
  exception when others then
    if sqlerrm not like '%Application inconnue%' then
      v_fail := v_fail || format('S0b: refuse, mais message inattendu (%s)', sqlerrm);
    end if; end;
  execute 'reset role';

  -- S1. SANS part, RIEN ne change : ni refus, ni sous-compteur, ni drapeau,
  -- et les chiffres rendus sont ceux du plafond entier.
  select * into r from public.reserve_ai_usage(org_s, 'mistral', 'agent', 100, 'nora', key_nora);
  if not r.allowed or r.reason is distinct from 'ok' then
    v_fail := v_fail || format('S1a: sans part, allowed=%s reason=%s', r.allowed, r.reason); end if;
  select consumer_counted into v_bool from public.ai_usage_events where id = r.event_id;
  if v_bool then v_fail := v_fail || 'S1b: consumer_counted sans part'::text; end if;
  select count(*) into v_int from public.ai_usage_consumer_counters where organization_id = org_s;
  if v_int <> 0 then v_fail := v_fail || format('S1c: %s sous-compteur(s) sans part', v_int); end if;
  if r.limit_tokens is distinct from 10000 or r.reserved_tokens is distinct from 100 then
    v_fail := v_fail || format('S1d: sans part, limite %s reserve %s, attendu 10000/100', r.limit_tokens, r.reserved_tokens); end if;
  perform public.settle_ai_usage(r.event_id, 0, 'failed');

  -- S2. Part posée : l'appel réserve sur LES DEUX compteurs.
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_ai_usage_consumer_quota(org_s, 'nora', 1000);
  execute 'reset role';

  select * into r from public.reserve_ai_usage(org_s, 'mistral', 'agent', 600, 'nora', key_nora);
  ev_n := r.event_id;
  if not r.allowed or r.reason is distinct from 'ok' then
    v_fail := v_fail || format('S2a: sous la part, allowed=%s reason=%s', r.allowed, r.reason); end if;
  select consumer_counted into v_bool from public.ai_usage_events where id = ev_n;
  if v_bool is not true then v_fail := v_fail || 'S2b: consumer_counted absent du journal'::text; end if;
  select reserved_tokens into v_big from public.ai_usage_consumer_counters
   where organization_id = org_s and consumer = 'nora' and period = v_period;
  if v_big is distinct from 600 then v_fail := v_fail || format('S2c: sous-compteur reserve %s, attendu 600', v_big); end if;
  select reserved_tokens into v_big from public.ai_usage_counters
   where organization_id = org_s and provider = '__global__' and period = v_period;
  if v_big is distinct from 600 then v_fail := v_fail || format('S2d: compteur commun reserve %s, attendu 600', v_big); end if;
  -- Les chiffres rendus à une application AVEC part sont ceux de SA part.
  if r.limit_tokens is distinct from 1000 or r.reserved_tokens is distinct from 600 then
    v_fail := v_fail || format('S2e: chiffres rendus limite %s reserve %s, attendu 1000/600', r.limit_tokens, r.reserved_tokens); end if;

  -- S3. Au-delà : refus NOMMÉ, chiffres de la part, et RIEN n'est incrémenté.
  select * into r from public.reserve_ai_usage(org_s, 'mistral', 'agent', 600, 'nora', key_nora);
  if r.allowed or r.reason is distinct from 'consumer_quota_exceeded' then
    v_fail := v_fail || format('S3a: au-dela de la part, allowed=%s reason=%s', r.allowed, r.reason); end if;
  if r.event_id is not null then v_fail := v_fail || 'S3b: un refus a ete journalise'::text; end if;
  if r.limit_tokens is distinct from 1000 then
    v_fail := v_fail || format('S3c: limite rendue %s, attendu celle de la part (1000)', r.limit_tokens); end if;
  select reserved_tokens into v_big from public.ai_usage_consumer_counters
   where organization_id = org_s and consumer = 'nora' and period = v_period;
  select reserved_tokens into v_big2 from public.ai_usage_counters
   where organization_id = org_s and provider = '__global__' and period = v_period;
  if v_big is distinct from 600 or v_big2 is distinct from 600 then
    v_fail := v_fail || format('S3d: un refus a incremente (sous=%s commun=%s)', v_big, v_big2); end if;

  -- S4. ⚠️ LE PARTAGE : les agents sont bornés au RESTE. Nora a 600 réservés
  -- sur une part de 1000 : 400 lui restent réservés, et le compteur commun
  -- (600) ne peut monter qu'à 9600. Les chiffres rendus à iris sont ceux de
  -- SON plafond : 10000 − 1000 = 9000, et un engagé qui exclut la part.
  select * into r from public.reserve_ai_usage(org_s, 'mistral', 'agent', 9200, 'iris', key_iris);
  if r.allowed or r.reason is distinct from 'quota_exceeded' then
    v_fail := v_fail || format('S4a: iris a mordu sur la part de nora (allowed=%s reason=%s)', r.allowed, r.reason); end if;
  if r.limit_tokens is distinct from 9000 then
    v_fail := v_fail || format('S4b: plafond rendu a iris %s, attendu 9000 (10000 - la part)', r.limit_tokens); end if;
  -- Les chiffres rendus sont ceux d'iris : l'engagé commun MOINS celui des parts.
  if r.used_tokens is distinct from 0 or r.reserved_tokens is distinct from 0 then
    v_fail := v_fail || format('S4c: chiffres rendus a iris used=%s reserved=%s, attendu 0/0', r.used_tokens, r.reserved_tokens); end if;
  select reserved_tokens into v_big from public.ai_usage_counters
   where organization_id = org_s and provider = '__global__' and period = v_period;
  if v_big is distinct from 600 then v_fail := v_fail || format('S4d: un refus a incremente le commun (%s)', v_big); end if;
  select * into r from public.reserve_ai_usage(org_s, 'mistral', 'agent', 9000, 'iris', key_iris);
  ev_i := r.event_id;
  if not r.allowed or r.reason is distinct from 'ok' then
    v_fail := v_fail || format('S4e: iris refusee dans le reste (allowed=%s reason=%s)', r.allowed, r.reason); end if;
  if r.limit_tokens is distinct from 9000 or r.reserved_tokens is distinct from 9000 then
    v_fail := v_fail || format('S4f: chiffres rendus a iris limite %s reserve %s, attendu 9000/9000', r.limit_tokens, r.reserved_tokens); end if;
  select consumer_counted into v_bool from public.ai_usage_events where id = ev_i;
  if v_bool then v_fail := v_fail || 'S4g: iris comptee sur un sous-compteur'::text; end if;
  perform public.settle_ai_usage(ev_i, 0, 'failed');

  -- S5. Le règlement solde LES DEUX compteurs avec la consommation réelle.
  perform public.settle_ai_usage(ev_n, 450, 'completed');
  select used_tokens, reserved_tokens into v_big, v_big2 from public.ai_usage_consumer_counters
   where organization_id = org_s and consumer = 'nora' and period = v_period;
  if v_big is distinct from 450 or v_big2 is distinct from 0 then
    v_fail := v_fail || format('S5a: sous-compteur used=%s reserved=%s, attendu 450/0', v_big, v_big2); end if;
  select used_tokens into v_big from public.ai_usage_counters
   where organization_id = org_s and provider = '__global__' and period = v_period;
  if v_big is distinct from 450 then v_fail := v_fail || format('S5b: compteur commun used=%s, attendu 450', v_big); end if;
  -- Idempotent là aussi : un second règlement ne double rien.
  perform public.settle_ai_usage(ev_n, 450, 'completed');
  select used_tokens into v_big from public.ai_usage_consumer_counters
   where organization_id = org_s and consumer = 'nora' and period = v_period;
  if v_big is distinct from 450 then v_fail := v_fail || format('S5c: second reglement, sous-compteur used=%s', v_big); end if;

  -- S6. Un échec libère la réservation du sous-compteur, et ne facture rien.
  select * into r from public.reserve_ai_usage(org_s, 'mistral', 'agent', 300, 'nora', key_nora);
  perform public.settle_ai_usage(r.event_id, 300, 'failed');
  select used_tokens, reserved_tokens into v_big, v_big2 from public.ai_usage_consumer_counters
   where organization_id = org_s and consumer = 'nora' and period = v_period;
  if v_big is distinct from 450 or v_big2 is distinct from 0 then
    v_fail := v_fail || format('S6a: apres echec, sous-compteur used=%s reserved=%s', v_big, v_big2); end if;

  -- S7. ⚠️ LE POINT DÉLICAT : la part accepte (450+500 ≤ 1000), le plafond
  -- commun refuse. Pour l'atteindre malgré le partage, un appel d'agent a
  -- consommé PLUS que son estimation (9200 réels pour 9000 réservés) :
  -- l'engagé commun est 9650, et 500 de plus dépassent 10000. La réservation
  -- du sous-compteur doit être RENDUE — sinon chaque refus du commun rongerait
  -- la part d'une application qui n'a rien consommé.
  select * into r from public.reserve_ai_usage(org_s, 'mistral', 'agent', 9000, 'iris', key_iris);
  if not r.allowed then v_fail := v_fail || format('S7pre: iris refusee (%s)', r.reason); end if;
  perform public.settle_ai_usage(r.event_id, 9200, 'completed');
  select * into r from public.reserve_ai_usage(org_s, 'mistral', 'agent', 500, 'nora', key_nora);
  if r.allowed or r.reason is distinct from 'quota_exceeded' then
    v_fail := v_fail || format('S7a: plafond commun depasse, allowed=%s reason=%s', r.allowed, r.reason); end if;
  -- Aucune AUTRE part : la borne de nora sur le commun est le plafond entier.
  if r.limit_tokens is distinct from 10000 then
    v_fail := v_fail || format('S7b: limite rendue %s, attendu celle du plafond commun', r.limit_tokens); end if;
  select reserved_tokens into v_big from public.ai_usage_consumer_counters
   where organization_id = org_s and consumer = 'nora' and period = v_period;
  if v_big is distinct from 0 then
    v_fail := v_fail || format('S7c: reservation du sous-compteur NON rendue (%s)', v_big); end if;

  -- S8. Le réglage gouverne l'usage, pas la donnée : désactivée, la part ne
  -- borne plus rien, et sa valeur ET son mode sont conservés.
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_ai_usage_consumer_quota(org_s, 'nora', 1000, false);
  execute 'reset role';
  select * into r from public.reserve_ai_usage(org_s, 'mistral', 'agent', 100, 'nora', key_nora);
  if not r.allowed then v_fail := v_fail || format('S8a: part desactivee, refus (%s)', r.reason); end if;
  select consumer_counted into v_bool from public.ai_usage_events where id = r.event_id;
  if v_bool then v_fail := v_fail || 'S8b: part desactivee, appel tout de meme compte'::text; end if;
  perform public.settle_ai_usage(r.event_id, 0, 'failed');
  select monthly_limit_tokens, limit_mode into v_big, v_text from public.ai_usage_consumer_quotas
   where organization_id = org_s and consumer = 'nora';
  if v_big is distinct from 1000 or v_text is distinct from 'tokens' then
    v_fail := v_fail || format('S8c: valeur ou mode perdu a la desactivation (%s, %s)', v_big, v_text); end if;
  -- Désactivée, elle ne réserve plus rien aux dépens des agents non plus.
  select effective_tokens, is_active into v_big, v_bool from public.ai_usage_shares(org_s, v_period) where consumer = 'nora';
  if v_big is not null or v_bool then
    v_fail := v_fail || format('S8d: ai_usage_shares rend une part desactivee effective (%s)', v_big); end if;

  -- S9. Une collectivité SANS plafond commun peut tout de même borner une
  -- application par une part en JETONS — et son règlement passe AVANT le
  -- retour anticipé de settle. Les agents, eux, restent illimités.
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_ai_usage_consumer_quota(org_s2, 'nora', 200);
  execute 'reset role';
  select * into r from public.reserve_ai_usage(org_s2, 'mistral', 'agent', 150, 'nora', key_nora);
  ev_n := r.event_id;
  if not r.allowed or r.reason is distinct from 'no_quota_configured' then
    v_fail := v_fail || format('S9a: sans plafond commun, allowed=%s reason=%s', r.allowed, r.reason); end if;
  select * into r from public.reserve_ai_usage(org_s2, 'mistral', 'agent', 100, 'nora', key_nora);
  if r.allowed or r.reason is distinct from 'consumer_quota_exceeded' then
    v_fail := v_fail || format('S9b: part seule, allowed=%s reason=%s', r.allowed, r.reason); end if;
  perform public.settle_ai_usage(ev_n, 120, 'completed');
  select used_tokens, reserved_tokens into v_big, v_big2 from public.ai_usage_consumer_counters
   where organization_id = org_s2 and consumer = 'nora' and period = v_period;
  if v_big is distinct from 120 or v_big2 is distinct from 0 then
    v_fail := v_fail || format('S9c: sous-compteur used=%s reserved=%s, attendu 120/0', v_big, v_big2); end if;
  select count(*) into v_int from public.ai_usage_counters where organization_id = org_s2;
  if v_int <> 0 then v_fail := v_fail || 'S9d: un compteur commun a ete cree sans plafond commun'::text; end if;
  select * into r from public.reserve_ai_usage(org_s2, 'mistral', 'agent', 50000, 'iris', key_iris);
  if not r.allowed or r.reason is distinct from 'no_quota_configured' then
    v_fail := v_fail || format('S9e: sans plafond commun, iris bornee par la part de nora (%s)', r.reason); end if;
  perform public.settle_ai_usage(r.event_id, 0, 'failed');

  -- S10. La porte de réglage est réservée au SUPER ADMIN, et il n'y en a pas d'autre.
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.set_ai_usage_consumer_quota(org_s, 'nora', 999999);
    v_fail := v_fail || 'S10a: un utilisateur ordinaire a pose une part'::text;
  exception when others then
    if sqlerrm not like '%super administrateur%' then
      v_fail := v_fail || format('S10a: refuse, message inattendu (%s)', sqlerrm);
    end if; end;
  begin
    perform public.delete_ai_usage_consumer_quota(org_s, 'nora');
    v_fail := v_fail || 'S10b: un utilisateur ordinaire a retire une part'::text;
  exception when others then
    if sqlerrm not like '%super administrateur%' then
      v_fail := v_fail || format('S10b: refuse, message inattendu (%s)', sqlerrm);
    end if; end;
  -- La lecture des parts suit le RLS : un utilisateur étranger ne voit rien.
  select count(*) into v_int from public.ai_usage_shares(org_s, v_period);
  if v_int <> 0 then v_fail := v_fail || format('S10e: ai_usage_shares a servi %s part(s) a un etranger', v_int); end if;
  execute 'reset role';
  -- Le privilège de table existe (Supabase l'accorde par défaut) : c'est le RLS
  -- sans policy d'écriture qui ferme. On vérifie donc les policies, pas le GRANT.
  select count(*) into v_int from pg_policies
   where schemaname = 'public'
     and tablename in ('ai_usage_consumer_quotas', 'ai_usage_consumer_counters')
     and cmd <> 'SELECT';
  if v_int <> 0 then v_fail := v_fail || format('S10c: %s policy d''ecriture sur les tables des parts', v_int); end if;
  select count(*) into v_int from pg_class
   where oid in ('public.ai_usage_consumer_quotas'::regclass, 'public.ai_usage_consumer_counters'::regclass)
     and relrowsecurity;
  if v_int <> 2 then v_fail := v_fail || 'S10d: RLS non actif sur les tables des parts'::text; end if;

  -- S11. Retirer la part conserve le sous-compteur : c'est de l'historique,
  -- et une part reposée dans le mois retrouve la dépense.
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.delete_ai_usage_consumer_quota(org_s2, 'nora');
  execute 'reset role';
  select used_tokens into v_big from public.ai_usage_consumer_counters
   where organization_id = org_s2 and consumer = 'nora' and period = v_period;
  if v_big is distinct from 120 then v_fail := v_fail || format('S11a: sous-compteur perdu au retrait (%s)', v_big); end if;
  select * into r from public.reserve_ai_usage(org_s2, 'mistral', 'agent', 5000, 'nora', key_nora);
  if not r.allowed then v_fail := v_fail || format('S11b: part retiree, refus (%s)', r.reason); end if;

  -- ==========================================================================
  -- T. LE PARTAGE DU PLAFOND 🆕 (2026-09-22) — jetons, pourcentage VIVANT,
  --    cas limites inoffensifs, et ce que la RPC refuse.
  -- ==========================================================================
  -- T0. LA résolution d'une part, testée à nu : plancher entier, borne au
  -- plafond, pourcentage sans plafond ⇒ NULL (sans effet).
  if public.ai_usage_share_effective('percent', null, 25::smallint, 999::bigint) is distinct from 249 then
    v_fail := v_fail || 'T0a: 25 % de 999 doit valoir 249 (plancher entier)'::text; end if;
  if public.ai_usage_share_effective('tokens', 5000::bigint, null, 3000::bigint) is distinct from 3000 then
    v_fail := v_fail || 'T0b: une part en jetons se borne au plafond'::text; end if;
  if public.ai_usage_share_effective('percent', null, 25::smallint, null) is not null then
    v_fail := v_fail || 'T0c: un pourcentage sans plafond doit etre sans effet (NULL)'::text; end if;
  if public.ai_usage_share_effective('tokens', 5000::bigint, null, null) is distinct from 5000 then
    v_fail := v_fail || 'T0d: une part en jetons sans plafond vaut telle quelle'::text; end if;

  -- T1. Part en jetons : chacun sa part, et la somme fait le plafond.
  insert into public.organizations (name, parent_id) values ('Collectivité T', null) returning id into org_t;
  insert into public.ai_usage_quotas (organization_id, provider, monthly_limit_tokens)
       values (org_t, '__global__', 10000);
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_ai_usage_consumer_quota(org_t, 'nora', 4000);
  execute 'reset role';
  select * into r from public.reserve_ai_usage(org_t, 'mistral', 'agent', 6000, 'iris', key_iris);
  ev_i := r.event_id;
  if not r.allowed or r.limit_tokens is distinct from 6000 then
    v_fail := v_fail || format('T1a: iris dans le reste, allowed=%s limite=%s (attendu 6000)', r.allowed, r.limit_tokens); end if;
  select * into r from public.reserve_ai_usage(org_t, 'mistral', 'agent', 1, 'clara', key_clara);
  if r.allowed or r.reason is distinct from 'quota_exceeded' or r.limit_tokens is distinct from 6000 then
    v_fail := v_fail || format('T1b: le reste est epuise, allowed=%s reason=%s limite=%s', r.allowed, r.reason, r.limit_tokens); end if;
  if r.used_tokens is distinct from 0 or r.reserved_tokens is distinct from 6000 then
    v_fail := v_fail || format('T1c: chiffres rendus a clara used=%s reserved=%s, attendu 0/6000', r.used_tokens, r.reserved_tokens); end if;
  -- La part de nora est intacte : 4000, malgré un reste épuisé.
  select * into r from public.reserve_ai_usage(org_t, 'mistral', 'agent', 4000, 'nora', key_nora);
  ev_n := r.event_id;
  if not r.allowed or r.limit_tokens is distinct from 4000 then
    v_fail := v_fail || format('T1d: nora privee de sa part, allowed=%s reason=%s limite=%s', r.allowed, r.reason, r.limit_tokens); end if;

  -- T2. Ce que nora a CONSOMMÉ de sa part n'est plus à réserver : 1000
  -- consommés sur 4000 ⇒ 3000 restent réservés, le compteur commun (1000)
  -- peut monter à 7000. Le PLAFOND des agents, lui, ne bouge pas : 6000, et
  -- leur engagé exclut ce que nora a consommé.
  perform public.settle_ai_usage(ev_n, 1000, 'completed');
  perform public.settle_ai_usage(ev_i, 0, 'failed');
  select * into r from public.reserve_ai_usage(org_t, 'mistral', 'agent', 6000, 'iris', key_iris);
  ev_i := r.event_id;
  if not r.allowed or r.limit_tokens is distinct from 6000 then
    v_fail := v_fail || format('T2a: plafond des agents %s, attendu 6000 (allowed=%s)', r.limit_tokens, r.allowed); end if;
  if r.used_tokens is distinct from 0 or r.reserved_tokens is distinct from 6000 then
    v_fail := v_fail || format('T2b: chiffres rendus a iris used=%s reserved=%s, attendu 0/6000', r.used_tokens, r.reserved_tokens); end if;
  select * into r from public.reserve_ai_usage(org_t, 'mistral', 'agent', 1001, 'clara', key_clara);
  if r.allowed or r.limit_tokens is distinct from 6000 then
    v_fail := v_fail || format('T2c: clara au-dela du reste, allowed=%s limite=%s (attendu 6000)', r.allowed, r.limit_tokens); end if;
  perform public.settle_ai_usage(ev_i, 0, 'failed');

  -- T3. Pourcentage VIVANT : 25 % de 10000 = 2500 ; relever le plafond à
  -- 20000 fait suivre la part (5000) sans la retoucher.
  insert into public.organizations (name, parent_id) values ('Collectivité T2', null) returning id into org_t2;
  insert into public.ai_usage_quotas (organization_id, provider, monthly_limit_tokens)
       values (org_t2, '__global__', 10000);
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_ai_usage_consumer_quota(org_t2, 'nora', p_limit_percent => 25);
  select effective_tokens, limit_mode, limit_percent, configured_tokens
    into v_big, v_text, v_int, v_big2
    from public.ai_usage_shares(org_t2, v_period) where consumer = 'nora';
  if v_big is distinct from 2500 or v_text is distinct from 'percent' or v_int is distinct from 25 or v_big2 is not null then
    v_fail := v_fail || format('T3a: ai_usage_shares eff=%s mode=%s pct=%s jetons=%s, attendu 2500/percent/25/NULL', v_big, v_text, v_int, v_big2); end if;
  execute 'reset role';
  select * into r from public.reserve_ai_usage(org_t2, 'mistral', 'agent', 2501, 'nora', key_nora);
  if r.allowed or r.reason is distinct from 'consumer_quota_exceeded' or r.limit_tokens is distinct from 2500 then
    v_fail := v_fail || format('T3b: 25 %% de 10000, allowed=%s reason=%s limite=%s', r.allowed, r.reason, r.limit_tokens); end if;
  select * into r from public.reserve_ai_usage(org_t2, 'mistral', 'agent', 7501, 'iris', key_iris);
  if r.allowed or r.limit_tokens is distinct from 7500 then
    v_fail := v_fail || format('T3c: reste des agents %s, attendu 7500 (allowed=%s)', r.limit_tokens, r.allowed); end if;
  select * into r from public.reserve_ai_usage(org_t2, 'mistral', 'agent', 7500, 'iris', key_iris);
  ev_i := r.event_id;
  if not r.allowed then v_fail := v_fail || format('T3d: iris refusee dans son reste (%s)', r.reason); end if;
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_ai_usage_quota(org_t2, 20000);
  select effective_tokens into v_big from public.ai_usage_shares(org_t2, v_period) where consumer = 'nora';
  if v_big is distinct from 5000 then v_fail := v_fail || format('T3e: plafond releve, part effective %s, attendu 5000', v_big); end if;
  execute 'reset role';
  select * into r from public.reserve_ai_usage(org_t2, 'mistral', 'agent', 7500, 'clara', key_clara);
  if not r.allowed or r.limit_tokens is distinct from 15000 then
    v_fail := v_fail || format('T3f: plafond releve, reste des agents %s (allowed=%s), attendu 15000', r.limit_tokens, r.allowed); end if;
  select * into r from public.reserve_ai_usage(org_t2, 'mistral', 'agent', 5000, 'nora', key_nora);
  if not r.allowed or r.limit_tokens is distinct from 5000 then
    v_fail := v_fail || format('T3g: plafond releve, part de nora %s (allowed=%s), attendu 5000', r.limit_tokens, r.allowed); end if;
  select * into r from public.reserve_ai_usage(org_t2, 'mistral', 'agent', 1, 'nora', key_nora);
  if r.allowed then v_fail := v_fail || 'T3h: nora au-dela de 5000'::text; end if;

  -- T4. Pourcentage SANS plafond commun : accepté, et sans effet — ni pour
  -- nora, ni pour les agents. Le réglage gouverne l'usage, pas la donnée.
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.set_ai_usage_consumer_quota(org_s2, 'nora', p_limit_percent => 30);
  exception when others then
    v_fail := v_fail || format('T4a: pourcentage sans plafond refuse (%s)', sqlerrm); end;
  select effective_tokens into v_big from public.ai_usage_shares(org_s2, v_period) where consumer = 'nora';
  if v_big is not null then v_fail := v_fail || format('T4b: part effective sans plafond %s, attendu NULL', v_big); end if;
  execute 'reset role';
  select * into r from public.reserve_ai_usage(org_s2, 'mistral', 'agent', 50000, 'nora', key_nora);
  if not r.allowed or r.reason is distinct from 'no_quota_configured' then
    v_fail := v_fail || format('T4c: pourcentage sans plafond, nora bornee (allowed=%s reason=%s)', r.allowed, r.reason); end if;
  select consumer_counted into v_bool from public.ai_usage_events where id = r.event_id;
  if v_bool then v_fail := v_fail || 'T4d: pourcentage sans plafond, appel compte sur le sous-compteur'::text; end if;
  perform public.settle_ai_usage(r.event_id, 0, 'failed');

  -- T5. Ce que la RPC refuse : les invalidités INTRINSÈQUES, rien d'autre.
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.set_ai_usage_consumer_quota(org_t, 'nora', 1000, true, 25);
    v_fail := v_fail || 'T5a: jetons ET pourcentage acceptes ensemble'::text;
  exception when others then
    if sqlerrm not like '%pas les deux%' then
      v_fail := v_fail || format('T5a: refuse, message inattendu (%s)', sqlerrm); end if; end;
  begin
    perform public.set_ai_usage_consumer_quota(org_t, 'nora');
    v_fail := v_fail || 'T5b: une part sans valeur acceptee'::text;
  exception when others then
    if sqlerrm not like '%strictement positif%' then
      v_fail := v_fail || format('T5b: refuse, message inattendu (%s)', sqlerrm); end if; end;
  begin
    perform public.set_ai_usage_consumer_quota(org_t, 'nora', p_limit_percent => 100);
    v_fail := v_fail || 'T5c: 100 % accepte'::text;
  exception when others then
    if sqlerrm not like '%entre 1 et 99%' then
      v_fail := v_fail || format('T5c: refuse, message inattendu (%s)', sqlerrm); end if; end;
  begin
    perform public.set_ai_usage_consumer_quota(org_t, 'nora', p_limit_percent => 0);
    v_fail := v_fail || 'T5d: 0 % accepte'::text;
  exception when others then
    if sqlerrm not like '%entre 1 et 99%' then
      v_fail := v_fail || format('T5d: refuse, message inattendu (%s)', sqlerrm); end if; end;
  begin
    perform public.set_ai_usage_consumer_quota(org_t, 'nora', 0);
    v_fail := v_fail || 'T5e: 0 jeton accepte'::text;
  exception when others then
    if sqlerrm not like '%strictement positif%' then
      v_fail := v_fail || format('T5e: refuse, message inattendu (%s)', sqlerrm); end if; end;
  -- Une part en jetons PLUS GRANDE que le plafond est acceptée : elle sera
  -- bornée à la lecture (T6). Refuser ici ne serait pas un invariant.
  begin
    perform public.set_ai_usage_consumer_quota(org_t, 'clara', 50000);
  exception when others then
    v_fail := v_fail || format('T5f: une part en jetons au-dela du plafond a ete refusee (%s)', sqlerrm); end;
  execute 'reset role';
  -- L'ancienne signature à quatre paramètres n'existe plus : une seule surcharge.
  select count(*), max(pronargs) into v_int, v_big from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'set_ai_usage_consumer_quota';
  if v_int <> 1 or v_big <> 5 then
    v_fail := v_fail || format('T5g: %s surcharge(s) de set_ai_usage_consumer_quota (max %s params), attendu 1/5', v_int, v_big); end if;

  -- T6. Une part en jetons plus grande que le plafond se borne AU plafond ;
  -- n parts peuvent ensemble le dépasser : la borne des autres est 0, jamais
  -- négative. Sur org_t : plafond 10000, nora 4000 (1000 consommés), clara 50000.
  select effective_tokens into v_big from public.ai_usage_shares(org_t, v_period) where consumer = 'clara';
  if v_big is distinct from 10000 then v_fail := v_fail || format('T6a: part de clara effective %s, attendu 10000 (bornee)', v_big); end if;
  select * into r from public.reserve_ai_usage(org_t, 'mistral', 'agent', 1, 'iris', key_iris);
  if r.allowed or r.limit_tokens is distinct from 0 then
    v_fail := v_fail || format('T6b: reste des agents %s (allowed=%s), attendu 0 — jamais negatif', r.limit_tokens, r.allowed); end if;

  -- T7. Désactiver conserve valeur et mode ; changer de mode efface l'autre
  -- unité (CHECK exclusif) ; réactiver est un geste, pas une ressaisie.
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.delete_ai_usage_consumer_quota(org_t, 'clara');
  perform public.set_ai_usage_consumer_quota(org_t, 'nora', 4000, false);
  execute 'reset role';
  select * into r from public.reserve_ai_usage(org_t, 'mistral', 'agent', 9000, 'iris', key_iris);
  if not r.allowed or r.limit_tokens is distinct from 10000 then
    v_fail := v_fail || format('T7a: part desactivee, reste des agents %s (allowed=%s), attendu 10000', r.limit_tokens, r.allowed); end if;
  perform public.settle_ai_usage(r.event_id, 0, 'failed');
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_ai_usage_consumer_quota(org_t, 'nora', p_is_active => true, p_limit_percent => 10);
  select limit_mode, limit_percent, monthly_limit_tokens into v_text, v_int, v_big
    from public.ai_usage_consumer_quotas where organization_id = org_t and consumer = 'nora';
  if v_text is distinct from 'percent' or v_int is distinct from 10 or v_big is not null then
    v_fail := v_fail || format('T7b: passage en pourcentage mode=%s pct=%s jetons=%s', v_text, v_int, v_big); end if;
  perform public.set_ai_usage_consumer_quota(org_t, 'nora', 4000);
  select limit_mode, limit_percent, monthly_limit_tokens into v_text, v_int, v_big
    from public.ai_usage_consumer_quotas where organization_id = org_t and consumer = 'nora';
  if v_text is distinct from 'tokens' or v_int is not null or v_big is distinct from 4000 then
    v_fail := v_fail || format('T7c: retour en jetons mode=%s pct=%s jetons=%s', v_text, v_int, v_big); end if;
  execute 'reset role';

  -- ==========================================================================
  if array_length(v_fail, 1) is null then
    raise exception 'TOUS LES TESTS SONT PASSES (plafond + debit + partage IA, Socle) -- transaction annulee.';
  else
    raise exception 'ECHECS (%) : %', array_length(v_fail, 1), array_to_string(v_fail, ' · ');
  end if;
end
$main$;
