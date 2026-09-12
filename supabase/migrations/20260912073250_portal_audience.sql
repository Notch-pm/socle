-- Fréquentation du site de démarches — des COMPTEURS, et rien d'autre.
--
-- Nora tourne dans le navigateur de l'usager et n'a pas de base : c'est le
-- Socle qui détient déjà le catalogue, le domaine et la page publiée, donc
-- c'est ici que la fréquentation se compte. Une quatrième edge function
-- (`audience-api`, scope `audience`) écrit par les RPC ci-dessous ; les deux
-- écrans de lecture passent par deux autres RPC gardées.
--
-- ⚠️ CE QUI EST STOCKÉ, ET POURQUOI IL N'Y A PAS DE CONSENTEMENT À DEMANDER.
-- Ces tables ne portent AUCUN identifiant : pas de visiteur, pas de session,
-- pas d'IP même hachée, pas de User-Agent, pas de référent. Un jour, une page,
-- un nombre. L'IP ne fait que transiter par le frein anti-abus de `portal-api`
-- (haché en mémoire, jamais écrit) ; le User-Agent y est lu pour en tirer trois
-- valeurs (`mobile`/`tablette`/`ordinateur`) puis jeté ; le référent n'est lu
-- que par le navigateur, qui en tire un oui/non. Rien n'est écrit sur le poste
-- de l'usager. Aucune donnée personnelle n'est donc collectée, et l'article 82
-- de la loi Informatique et Libertés ne s'applique pas.
-- Cette promesse est VÉRIFIABLE, pas déclarative : `supabase/tests/audience.test.sql`
-- épingle la LISTE EXACTE des colonnes des deux tables — le jour où quelqu'un
-- ajoutera `visitor_id` ou `ip_hash`, le test tombe. Même parti que le
-- passe-plat de l'`ai-api`.
--
-- ⚠️ UNE VISITE = UNE ARRIVÉE SUR LE SITE (décision PO). C'est la première page
-- affichée au chargement, quand le référent n'est pas le site lui-même et que
-- ce n'est pas un rechargement. Sans identifiant, « visiteurs uniques » n'a pas
-- de sens et n'est pas mesuré. Le navigateur décide ; le serveur ne fait
-- qu'incrémenter ce qu'on lui dit.

-- --------------------------------------------------------------------------
-- 0. Le cinquième scope
-- --------------------------------------------------------------------------
-- Recréée avec `audience`, en suivant le commentaire de
-- `20260908195042_applications_et_abonnements.sql` : un scope s'ajoute ICI ET
-- dans les fonctions, jamais dans l'UI seule.
alter table public.api_keys
  drop constraint if exists api_keys_scopes_known;
alter table public.api_keys
  add constraint api_keys_scopes_known
  check (scopes <@ array['read', 'contacts', 'smtp', 'ai', 'audience']::text[]);

-- --------------------------------------------------------------------------
-- 1. Les pages vues
-- --------------------------------------------------------------------------
create table public.portal_audience_pages (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  day             date not null,
  page            text not null,
  procedure_id    uuid,
  views           integer not null default 0,
  visits          integer not null default 0,
  deposits        integer not null default 0,
  constraint portal_audience_pages_page_check
    check (page in ('accueil', 'demarche', 'formulaire')),
  -- L'accueil n'a pas de démarche, les deux autres en ont une : la forme de la
  -- ligne dit à quoi elle se rapporte, sans qu'il faille le déduire ailleurs.
  constraint portal_audience_pages_procedure_check
    check ((page = 'accueil') = (procedure_id is null)),
  -- Un dépôt ne se fait que depuis un formulaire. Le compter sur une autre
  -- ligne rendrait le taux de dépôt (dépôts / formulaires ouverts) faux.
  constraint portal_audience_pages_deposits_check
    check (deposits = 0 or page = 'formulaire'),
  constraint portal_audience_pages_counts_check
    check (views >= 0 and visits >= 0 and deposits >= 0),
  -- `nulls not distinct` (Postgres ≥ 15) : sans lui, chaque vue de l'accueil
  -- créerait une ligne de plus, l'unicité ne rapprochant jamais deux NULL.
  constraint portal_audience_pages_key
    unique nulls not distinct (organization_id, day, page, procedure_id)
);

comment on table public.portal_audience_pages is
  'Compteurs de fréquentation du site de démarches, par organisme du domaine, jour (heure de Paris) et page. Aucun identifiant de visiteur : voir l''en-tête de la migration portal_audience.';
comment on column public.portal_audience_pages.organization_id is
  'L''organisme DU DOMAINE visité — pas forcément une racine : une sous-organisation peut tenir son guichet.';
comment on column public.portal_audience_pages.procedure_id is
  'Démarche concernée, SANS clé étrangère : une démarche supprimée garde son historique. Elle est libellée « Démarche supprimée » à la lecture (motif resolveDocuments).';
comment on column public.portal_audience_pages.visits is
  'Arrivées sur le site (première page d''une navigation), pas visiteurs uniques.';

create index portal_audience_pages_org_day_idx
  on public.portal_audience_pages (organization_id, day);

-- --------------------------------------------------------------------------
-- 2. Les ventilations (langue, appareil)
-- --------------------------------------------------------------------------
-- Une table à part plutôt que des colonnes : les valeurs sont ouvertes (11
-- langues aujourd'hui, davantage demain) et ne se croisent pas avec les pages.
-- Croiser langue × appareil × page multiplierait les lignes sans qu'aucun
-- écran ne le demande.
create table public.portal_audience_breakdown (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  day             date not null,
  dimension       text not null,
  value           text not null,
  views           integer not null default 0,
  visits          integer not null default 0,
  primary key (organization_id, day, dimension, value),
  constraint portal_audience_breakdown_dimension_check
    check (dimension in ('langue', 'appareil')),
  -- La forme est vérifiée en base parce que ces valeurs ressortent telles
  -- quelles dans un écran : code BCP 47 pour une langue (même expression que
  -- `is_valid_language_set`), liste fermée pour un appareil.
  constraint portal_audience_breakdown_value_check
    check (
      (dimension = 'langue' and value ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$')
      or (dimension = 'appareil' and value in ('mobile', 'tablette', 'ordinateur'))
    ),
  constraint portal_audience_breakdown_counts_check
    check (views >= 0 and visits >= 0)
);

comment on table public.portal_audience_breakdown is
  'Ventilation quotidienne de la fréquentation par langue servie et type d''appareil. Le User-Agent n''est jamais stocké : seule la classe en est tirée, côté portal-api.';

-- --------------------------------------------------------------------------
-- 3. Aucune policy — seules les RPC entrent
-- --------------------------------------------------------------------------
-- RLS activé SANS policy : ni `anon` ni `authenticated` ne lit ou n'écrit ces
-- tables en direct. L'écriture passe par deux RPC réservées au service role
-- (l'edge function), la lecture par deux RPC `security definer` gardées. Une
-- policy de lecture, même large, ferait de la forme des tables un contrat
-- public — or leur découpage doit rester libre.
alter table public.portal_audience_pages enable row level security;
alter table public.portal_audience_breakdown enable row level security;

-- --------------------------------------------------------------------------
-- 4. Écriture — appelable par le service role seul
-- --------------------------------------------------------------------------
-- `security invoker` : le service role passe déjà outre le RLS, inutile
-- d'élever quoi que ce soit. C'est l'EXECUTE qui garde la porte, motif
-- `org_subtree_ids`.
create or replace function public.record_portal_page_view(
  p_organization_id uuid,
  p_page            text,
  p_procedure_id    uuid default null,
  p_entry           boolean default false,
  p_lang            text default null,
  p_device          text default null
) returns boolean
  language plpgsql
  set search_path to 'public'
as $$
declare
  v_day      date := (now() at time zone 'Europe/Paris')::date;
  v_visit    integer := case when coalesce(p_entry, false) then 1 else 0 end;
  v_root     uuid;
begin
  -- Le jour vient TOUJOURS du serveur : une horloge de navigateur décalée (ou
  -- trafiquée) ferait atterrir des vues dans le futur, et la période affichée
  -- ne les montrerait jamais.
  if p_organization_id is null or p_page is null then
    return false;
  end if;
  if p_page not in ('accueil', 'demarche', 'formulaire') then
    return false;
  end if;
  if (p_page = 'accueil') <> (p_procedure_id is null) then
    return false;
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
    return false;
  end if;

  -- La démarche doit appartenir au catalogue de la RACINE du tenant : sans
  -- cette vérification, une clé plateforme pourrait gonfler les compteurs
  -- d'une collectivité avec les démarches d'une autre. On ne lève pas
  -- d'exception — un compteur n'a pas à faire échouer une page.
  if p_procedure_id is not null then
    select p.organization_id into v_root
      from public.procedures p where p.id = p_procedure_id;
    if v_root is null then
      return false;
    end if;
    if not (p_organization_id = any (public.org_subtree_ids(v_root))) then
      return false;
    end if;
  end if;

  insert into public.portal_audience_pages as t
    (organization_id, day, page, procedure_id, views, visits)
  values (p_organization_id, v_day, p_page, p_procedure_id, 1, v_visit)
  on conflict (organization_id, day, page, procedure_id) do update
    set views = t.views + 1, visits = t.visits + excluded.visits;

  if p_lang is not null and p_lang ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$' then
    insert into public.portal_audience_breakdown as b
      (organization_id, day, dimension, value, views, visits)
    values (p_organization_id, v_day, 'langue', p_lang, 1, v_visit)
    on conflict (organization_id, day, dimension, value) do update
      set views = b.views + 1, visits = b.visits + excluded.visits;
  end if;

  if p_device in ('mobile', 'tablette', 'ordinateur') then
    insert into public.portal_audience_breakdown as b
      (organization_id, day, dimension, value, views, visits)
    values (p_organization_id, v_day, 'appareil', p_device, 1, v_visit)
    on conflict (organization_id, day, dimension, value) do update
      set views = b.views + 1, visits = b.visits + excluded.visits;
  end if;

  return true;
end;
$$;

comment on function public.record_portal_page_view(uuid, text, uuid, boolean, text, text) is
  'Incrémente les compteurs de fréquentation du portail (page, langue, appareil). Le jour vient du serveur, heure de Paris. Renvoie false sans rien écrire si la démarche n''appartient pas au tenant.';

-- Un dépôt se pose sur la ligne `formulaire` de la démarche — la page d'où il
-- part. C'est ce qui permet de lire un taux (dépôts / formulaires ouverts)
-- sans jointure.
create or replace function public.record_portal_deposit(
  p_organization_id uuid,
  p_procedure_id    uuid
) returns boolean
  language plpgsql
  set search_path to 'public'
as $$
declare
  v_day  date := (now() at time zone 'Europe/Paris')::date;
  v_root uuid;
begin
  if p_organization_id is null or p_procedure_id is null then
    return false;
  end if;
  select p.organization_id into v_root
    from public.procedures p where p.id = p_procedure_id;
  if v_root is null then
    return false;
  end if;
  if not (p_organization_id = any (public.org_subtree_ids(v_root))) then
    return false;
  end if;

  insert into public.portal_audience_pages as t
    (organization_id, day, page, procedure_id, views, visits, deposits)
  values (p_organization_id, v_day, 'formulaire', p_procedure_id, 0, 0, 1)
  on conflict (organization_id, day, page, procedure_id) do update
    set deposits = t.deposits + 1;

  return true;
end;
$$;

comment on function public.record_portal_deposit(uuid, uuid) is
  'Incrémente le nombre de demandes déposées depuis le formulaire d''une démarche, pour le jour courant (heure de Paris).';

-- ⚠️ Réservées au service role, motif `org_subtree_ids` : appelables par
-- `authenticated`, n'importe quel compte pourrait fabriquer des chiffres.
revoke all on function public.record_portal_page_view(uuid, text, uuid, boolean, text, text)
  from public, anon, authenticated;
revoke all on function public.record_portal_deposit(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.record_portal_page_view(uuid, text, uuid, boolean, text, text)
  to service_role;
grant execute on function public.record_portal_deposit(uuid, uuid) to service_role;

-- --------------------------------------------------------------------------
-- 5. Lecture — le tableau de bord d'une collectivité
-- --------------------------------------------------------------------------
-- `returns jsonb` et non `returns table`, motif `root_onboarding_status` :
-- ajouter une clé est un `create or replace` sans `drop function`, et un
-- lecteur tolérant qui ignore une clé inconnue ne casse pas.
--
-- ⚠️ SECURITY DEFINER, garde `has_org_access(racine)` : avec le RLS, un simple
-- membre ne voit pas les sous-organisations et lirait des chiffres PARTIELS —
-- un tableau de bord qui ment est pire qu'un tableau de bord absent. Choix
-- assumé : les noms des sous-organisations et leur nombre d'activations
-- deviennent visibles de tout membre direct de la racine. Ils sont déjà
-- publics sur le portail.
create or replace function public.organization_dashboard(p_org_id uuid) returns jsonb
  language plpgsql stable security definer
  set search_path to 'public'
as $$
declare
  v_org     public.organizations%rowtype;
  v_subtree uuid[];
begin
  if not public.has_org_access(p_org_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  select * into v_org from public.organizations where id = p_org_id;
  if not found then
    raise exception 'Organisation introuvable.' using errcode = '23503';
  end if;
  if v_org.parent_id is not null then
    raise exception 'Le tableau de bord se lit sur une organisation principale (racine).'
      using errcode = '22023';
  end if;
  v_subtree := public.org_subtree_ids(p_org_id);

  return jsonb_build_object(
    'organization_id', p_org_id,
    'procedures', (
      select jsonb_build_object(
        'total', count(*),
        'production', count(*) filter (where p.status = 'production')
      ) from public.procedures p where p.organization_id = p_org_id
    ),
    -- Les usagers ACTIFS : une fiche archivée n'est plus un usager du
    -- référentiel, et la compter ferait un total qui ne baisse jamais.
    'contacts', (
      select jsonb_build_object(
        'total', count(*),
        'personne', count(*) filter (where c.contact_type = 'personne'),
        'entreprise', count(*) filter (where c.contact_type = 'entreprise'),
        'association', count(*) filter (where c.contact_type = 'association'),
        'administration', count(*) filter (where c.contact_type = 'administration')
      ) from public.contacts c
      where c.organization_id = p_org_id and c.status = 'active'
    ),
    -- Le sous-arbre ACTIF, dans l'ordre de l'arbre : c'est l'organigramme que
    -- l'agent a sous les yeux ailleurs dans l'application.
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'name', o.name,
        'parent_id', o.parent_id,
        'is_internal_service', o.is_internal_service,
        'enabled_procedures', (
          select count(*) from public.organization_procedures op
          where op.organization_id = o.id and op.is_enabled
        )
      ) order by o.name)
      from public.organizations o
      where o.id = any (v_subtree) and o.status = 'active'
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.organization_dashboard(uuid) is
  'Chiffres d''accueil d''une collectivité : démarches (total, production), usagers actifs par type, et sous-arbre actif avec le nombre de démarches activées. Membre de la racine.';

alter function public.organization_dashboard(uuid) owner to postgres;
revoke all on function public.organization_dashboard(uuid) from public, anon;
grant execute on function public.organization_dashboard(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- 6. Lecture — la fréquentation du site
-- --------------------------------------------------------------------------
create or replace function public.portal_audience(
  p_org_id uuid,
  p_from   date,
  p_to     date
) returns jsonb
  language plpgsql stable security definer
  set search_path to 'public'
as $$
declare
  v_org     public.organizations%rowtype;
  v_subtree uuid[];
  v_from    date := coalesce(p_from, (now() at time zone 'Europe/Paris')::date - 29);
  v_to      date := coalesce(p_to, (now() at time zone 'Europe/Paris')::date);
begin
  if not public.has_org_access(p_org_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  select * into v_org from public.organizations where id = p_org_id;
  if not found then
    raise exception 'Organisation introuvable.' using errcode = '23503';
  end if;
  if v_org.parent_id is not null then
    raise exception 'La fréquentation se lit sur une organisation principale (racine).'
      using errcode = '22023';
  end if;
  if v_to < v_from then
    raise exception 'Période invalide.' using errcode = '22023';
  end if;
  -- 400 jours : un an plus la marge d'une comparaison. Au-delà, la requête
  -- balayerait des années de compteurs pour un écran qui n'en montre pas.
  if v_to - v_from > 400 then
    raise exception 'Période trop longue (400 jours au maximum).' using errcode = '22023';
  end if;

  -- Le sous-arbre : le domaine visité peut être celui d'une sous-organisation,
  -- et la collectivité veut la fréquentation de SON site, guichets compris.
  v_subtree := public.org_subtree_ids(p_org_id);

  return jsonb_build_object(
    'from', v_from,
    'to', v_to,
    -- Les jours SANS DONNÉES sont absents : c'est au lecteur de compléter par
    -- des zéros (`seriesFor`), et transmettre 365 lignes vides n'apprendrait
    -- rien de plus.
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', d.day, 'views', d.views, 'visits', d.visits, 'deposits', d.deposits
      ) order by d.day)
      from (
        select t.day,
               sum(t.views)::int as views,
               sum(t.visits)::int as visits,
               sum(t.deposits)::int as deposits
        from public.portal_audience_pages t
        where t.organization_id = any (v_subtree) and t.day between v_from and v_to
        group by t.day
      ) d
    ), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'views', coalesce(sum(t.views), 0)::int,
        'visits', coalesce(sum(t.visits), 0)::int,
        'deposits', coalesce(sum(t.deposits), 0)::int,
        -- Le dénominateur du taux de dépôt : combien de fois un formulaire a
        -- été ouvert. Sans lui, « 12 dépôts » ne se rapporte à rien.
        'form_views', coalesce(sum(t.views) filter (where t.page = 'formulaire'), 0)::int
      )
      from public.portal_audience_pages t
      where t.organization_id = any (v_subtree) and t.day between v_from and v_to
    ),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'page', p.page,
        'procedure_id', p.procedure_id,
        'procedure_name', p.procedure_name,
        'views', p.views
      ) order by p.views desc, p.page)
      from (
        select t.page,
               t.procedure_id,
               -- La jointure est un LEFT JOIN sans clé étrangère : une
               -- démarche supprimée laisse `null`, que l'écran libelle
               -- « Démarche supprimée » plutôt que de perdre la ligne.
               (select pr.name from public.procedures pr where pr.id = t.procedure_id) as procedure_name,
               sum(t.views)::int as views
        from public.portal_audience_pages t
        where t.organization_id = any (v_subtree) and t.day between v_from and v_to
        group by t.page, t.procedure_id
        having sum(t.views) > 0
        order by sum(t.views) desc
        limit 10
      ) p
    ), '[]'::jsonb),
    'breakdown', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dimension', b.dimension, 'value', b.value, 'views', b.views, 'visits', b.visits
      ) order by b.dimension, b.views desc)
      from (
        select t.dimension, t.value,
               sum(t.views)::int as views,
               sum(t.visits)::int as visits
        from public.portal_audience_breakdown t
        where t.organization_id = any (v_subtree) and t.day between v_from and v_to
        group by t.dimension, t.value
      ) b
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.portal_audience(uuid, date, date) is
  'Fréquentation du site de démarches d''une collectivité sur une période (400 jours maximum) : série quotidienne, totaux, 10 pages les plus vues, ventilation langue/appareil. Membre de la racine.';

alter function public.portal_audience(uuid, date, date) owner to postgres;
revoke all on function public.portal_audience(uuid, date, date) from public, anon;
grant execute on function public.portal_audience(uuid, date, date) to authenticated;
