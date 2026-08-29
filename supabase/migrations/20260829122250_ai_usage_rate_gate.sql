-- Garde-fou de DÉBIT — la porte, dans `reserve_ai_usage`.
--
-- Remplace la fonction de `20260829100200`. ⚠️ LA SIGNATURE ET LE TYPE DE
-- RETOUR NE CHANGENT PAS : `reason` existait déjà et prend simplement une
-- nouvelle valeur, `'rate_limited'`. Pas de `DROP`, pas de « cannot change
-- return type », aucun consommateur cassé — c'est ce qui permet de poser ce
-- garde-fou sans toucher Iris ni redéployer quoi que ce soit d'autre.
--
-- ⚠️ LA PORTE DE DÉBIT PASSE EN PREMIER, avant même la lecture du plafond.
-- Trois raisons, et aucune n'est un détail :
--   1. Elle compte les TENTATIVES : une boucle que le plafond refuse doit être
--      coupée elle aussi, sans quoi elle martèle jusqu'à la fin du mois.
--   2. Passer en premier veut dire que rien n'a encore été incrémenté quand
--      elle refuse : il n'y a aucun retour en arrière à écrire, donc aucune
--      occasion de se tromper dans un chemin d'erreur rarement exécuté.
--   3. Elle protège les collectivités SANS plafond, qui sortent de la fonction
--      par un `return` anticipé plus bas et échapperaient à toute garde placée
--      après.
--
-- L'idiome est CELUI DE LA FONCTION, à la lettre : `insert … on conflict do
-- nothing`, puis UN `UPDATE` conditionnel dont le `WHERE` porte le verrou de
-- ligne. Deux appels concurrents se sérialisent d'eux-mêmes (MVCC, dès READ
-- COMMITTED). Ne pas remplacer par un `select` suivi d'un `update` : ce serait
-- exactement la condition de course que ce motif évite.

create or replace function public.reserve_ai_usage(
  p_org_id            uuid,
  p_provider          text,
  p_resource_type     text,
  p_estimated_tokens  bigint,
  p_consumer          text,
  p_api_key_id        uuid default null,
  p_feature           text default null,
  p_external_ref_kind text default null,
  p_external_ref_id   uuid default null,
  p_external_actor_id uuid default null
) returns table (
  event_id        uuid,
  allowed         boolean,
  reason          text,
  limit_tokens    bigint,
  used_tokens     bigint,
  reserved_tokens bigint,
  -- ⚠️ `usage_period` et NON `period` : une colonne de SORTIE nommée comme une
  -- colonne de table rend le nom ambigu dans `on conflict (…, period)`, la
  -- seule clause où un nom de colonne ne peut pas être qualifié. PostgreSQL
  -- refuse alors la fonction à l'exécution (42702).
  usage_period    text,
  renews_at       date
)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  -- ⚠️ LES SEUILS VIVENT ICI, EN DUR, ET C'EST LA DÉCISION (PO R3). Un
  -- garde-fou de sécurité n'est pas un paramètre commercial : le rendre
  -- réglable, c'est le voir relevé le jour où il gêne — or il ne gêne que les
  -- boucles. Un agent attend 10 à 15 s une réponse puis lit 150 mots : quatre
  -- questions par minute est déjà un rythme soutenu, 20 laisse la place aux
  -- rafales et aux réessais, et une boucle est coupée en moins d'une seconde.
  c_max_actor    constant int := 20;
  -- Filet des appelants qui n'identifient personne. Plus haut, parce qu'il
  -- couvre alors toute une collectivité et non un agent.
  c_max_consumer constant int := 120;

  v_kind      text;
  v_subject   text;
  v_max       int;
  v_window    timestamptz := date_trunc('minute', (now() at time zone 'utc'));

  v_period    text := to_char((now() at time zone 'utc'), 'YYYY-MM');
  v_renews    date := (date_trunc('month', (now() at time zone 'utc')) + interval '1 month')::date;
  v_estimate  bigint := greatest(coalesce(p_estimated_tokens, 0), 0);
  v_quota     public.ai_usage_quotas%rowtype;
  v_event     uuid;
  v_rows      int;
  v_used      bigint;
  v_reserved  bigint;
begin
  if coalesce(btrim(p_consumer), '') = '' then
    raise exception 'Consommateur manquant : la depense doit etre imputable.' using errcode = '22023';
  end if;

  -- ── PORTE 1 : LE DÉBIT ─────────────────────────────────────────────────
  -- Les deux sujets sont ALTERNATIFS, jamais cumulés. Iris envoie toujours son
  -- `actor_id`, donc en pratique la garde est par agent. Les cumuler
  -- obligerait à fixer la limite « application » au-dessus de la population
  -- d'agents d'une grande collectivité — ce qui la rendrait inopérante là où
  -- elle devrait servir.
  if p_external_actor_id is not null then
    v_kind := 'actor';
    v_subject := p_external_actor_id::text;
    v_max := c_max_actor;
  else
    v_kind := 'consumer';
    v_subject := btrim(p_consumer);
    v_max := c_max_consumer;
  end if;

  insert into public.ai_usage_rate (organization_id, subject_kind, subject, window_start)
       values (p_org_id, v_kind, v_subject, v_window)
  on conflict (organization_id, subject_kind, subject, window_start) do nothing;

  update public.ai_usage_rate r
     set attempts = r.attempts + 1
   where r.organization_id = p_org_id
     and r.subject_kind    = v_kind
     and r.subject         = v_subject
     and r.window_start    = v_window
     and r.attempts + 1   <= v_max;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    -- Refus de cadence. AUCUNE ligne de journal, comme pour un refus de
    -- plafond : le grand livre recense des APPELS, et un appel refusé n'a pas
    -- eu lieu. Les compteurs de jetons restent à NULL — il n'y a rien à en
    -- dire, et les remplir laisserait croire que le crédit est en cause.
    return query select null::uuid, false, 'rate_limited'::text,
                        null::bigint, null::bigint, null::bigint, v_period, v_renews;
    return;
  end if;

  -- ── PORTE 2 : LE PLAFOND ───────────────────────────────────────────────
  -- Plafond effectif : un plafond du fournisseur précis PRIME sur le global.
  select q.* into v_quota
    from public.ai_usage_quotas q
   where q.organization_id = p_org_id
     and q.provider in (p_provider, '__global__')
     and q.is_active
   order by (q.provider = p_provider) desc
   limit 1;

  -- Aucun plafond (ou désactivé) ⇒ ILLIMITÉ. C'est ce qui permet un
  -- déploiement progressif : une collectivité sans ligne de plafond n'est pas
  -- cassée par l'arrivée de l'assistant. L'appel est journalisé — on veut
  -- savoir ce qui a été consommé même hors plafond — mais aucun compteur n'est
  -- touché, et `counter_provider` reste NULL pour le dire.
  -- ⚠️ Ce `return` anticipé est la raison pour laquelle la porte de débit est
  -- placée AVANT : ici, elle a déjà fait son travail.
  if v_quota.id is null then
    insert into public.ai_usage_events (
      organization_id, provider, counter_provider, consumer, api_key_id, feature,
      resource_type, status, estimated_tokens, period,
      external_ref_kind, external_ref_id, external_actor_id
    ) values (
      p_org_id, p_provider, null, p_consumer, p_api_key_id, p_feature,
      p_resource_type, 'reserved', v_estimate, v_period,
      p_external_ref_kind, p_external_ref_id, p_external_actor_id
    ) returning id into v_event;
    return query select v_event, true, 'no_quota_configured'::text,
                        null::bigint, null::bigint, null::bigint, v_period, v_renews;
    return;
  end if;

  insert into public.ai_usage_counters (organization_id, provider, period)
       values (p_org_id, v_quota.provider, v_period)
  on conflict (organization_id, provider, period) do nothing;

  -- ── LE point de concurrence ────────────────────────────────────────────
  -- UN SEUL UPDATE conditionnel. Postgres prend le verrou de ligne dès
  -- l'évaluation du WHERE : deux transactions concurrentes sur la même ligne
  -- se sérialisent d'elles-mêmes (MVCC standard, valable dès READ COMMITTED —
  -- ni SERIALIZABLE ni verrou consultatif). Si 0 ligne est affectée, le
  -- plafond est atteint : refus SANS incrément et SANS avoir appelé le
  -- fournisseur.
  update public.ai_usage_counters c
     set reserved_tokens = c.reserved_tokens + v_estimate,
         updated_at      = now()
   where c.organization_id = p_org_id
     and c.provider        = v_quota.provider
     and c.period          = v_period
     and (c.used_tokens + c.reserved_tokens + v_estimate) <= v_quota.monthly_limit_tokens;
  get diagnostics v_rows = row_count;

  select c.used_tokens, c.reserved_tokens into v_used, v_reserved
    from public.ai_usage_counters c
   where c.organization_id = p_org_id
     and c.provider        = v_quota.provider
     and c.period          = v_period;

  if v_rows = 0 then
    -- Refus. AUCUNE ligne de journal : le grand livre recense des APPELS, et
    -- un appel refusé n'a pas eu lieu. Le compteur dit déjà l'histoire.
    return query select null::uuid, false, 'quota_exceeded'::text,
                        v_quota.monthly_limit_tokens, v_used, v_reserved, v_period, v_renews;
    return;
  end if;

  insert into public.ai_usage_events (
    organization_id, provider, counter_provider, consumer, api_key_id, feature,
    resource_type, status, estimated_tokens, period,
    external_ref_kind, external_ref_id, external_actor_id
  ) values (
    p_org_id, p_provider, v_quota.provider, p_consumer, p_api_key_id, p_feature,
    p_resource_type, 'reserved', v_estimate, v_period,
    p_external_ref_kind, p_external_ref_id, p_external_actor_id
  ) returning id into v_event;

  return query select v_event, true, 'ok'::text,
                      v_quota.monthly_limit_tokens, v_used, v_reserved, v_period, v_renews;
end $fn$;

alter function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  owner to postgres;
comment on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid) is
  'Réserve des jetons AVANT l''appel fournisseur. DEUX portes : le DÉBIT (tentatives par minute et par agent, refus compris) puis le PLAFOND mensuel. Chacune est UN update conditionnel = la sérialisation. Aucun plafond configuré ⇒ illimité, mais le débit s''applique quand même.';

-- ⚠️ Le `CREATE OR REPLACE` re-grante PUBLIC : les REVOKE sont à re-poser ici,
-- dans la même migration, sans quoi la fonction redevient appelable via
-- /rest/v1/rpc/ par n'importe quel porteur de la clé publiable.
revoke execute on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- Le balayage existant enchaîne désormais la purge des fenêtres de débit.
-- `cron.schedule` sur un nom existant met à jour la commande.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'release-stale-ai-reservations',
  '*/5 * * * *',
  $job$ select public.release_stale_ai_reservations(15); select public.purge_ai_usage_rate(60); $job$
);
