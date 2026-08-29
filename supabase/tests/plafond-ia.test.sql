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
--   6. 🆕 LE SCHÉMA EST LA PREUVE DU PASSE-PLAT — l'ensemble des colonnes
--      d'`ai_usage_events` est épinglé : une future colonne `prompt`,
--      `content` ou `answer` casse ce test au lieu de passer inaperçue.
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
begin
  -- ==========================================================================
  -- MISE EN PLACE
  -- ==========================================================================
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
      'actual_tokens','api_key_id','consumer','counter_provider','created_at',
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
  if array_length(v_fail, 1) is null then
    raise exception 'TOUS LES TESTS SONT PASSES (plafond IA, Socle) -- transaction annulee.';
  else
    raise exception 'ECHECS (%) : %', array_length(v_fail, 1), array_to_string(v_fail, ' · ');
  end if;
end
$main$;
