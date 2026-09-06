-- Langues d'une collectivité, et libellés traduits des démarches et catégories.
--
-- Le réglage vit sur l'ORGANISATION PRINCIPALE (racine), comme le catalogue de
-- démarches, les quartiers ou le plafond IA : les langues dans lesquelles une
-- collectivité s'adresse à ses usagers sont une affaire de collectivité, pas de
-- service. Une sous-organisation ne les redéfinit pas, elle les suit.
--
-- Le français est TOUJOURS actif et n'est jamais listé dans `translations` :
-- c'est la langue pivot, celle que portent les colonnes `name`. L'écrire deux
-- fois créerait deux sources de vérité pour un même libellé.

-- --------------------------------------------------------------------------
-- 1. Forme d'un jeu de codes de langue (CHECK)
-- --------------------------------------------------------------------------
-- La base valide la FORME, pas la liste : le catalogue des langues proposées
-- vit dans le code (`src/features/languages/languages.ts`), comme le catalogue
-- de variables des documents. Ajouter une langue ne doit pas demander une
-- migration.
create or replace function public.is_valid_language_set(codes text[])
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select codes is not null
     and cardinality(codes) >= 1
     and 'fr' = any(codes)
     and cardinality(codes) = (select count(distinct c) from unnest(codes) as c)
     and (select bool_and(c ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$') from unnest(codes) as c);
$$;

comment on function public.is_valid_language_set(text[]) is
  'Forme d''un jeu de codes de langue BCP 47 : au moins le français, sans doublon, codes bien formés. Miroir de LANGUAGE_CODE_RE côté application.';

alter table public.organizations
  add column if not exists enabled_languages text[] not null default array['fr']::text[];

alter table public.organizations
  drop constraint if exists organizations_enabled_languages_check;
alter table public.organizations
  add constraint organizations_enabled_languages_check
  check (public.is_valid_language_set(enabled_languages));

comment on column public.organizations.enabled_languages is
  'Langues activées par la collectivité (codes BCP 47), français toujours compris. Réglage porté par l''organisation principale uniquement ; les sous-organisations suivent leur racine (voir resolve_org_languages).';

-- --------------------------------------------------------------------------
-- 2. Le réglage n'appartient qu'à la racine
-- --------------------------------------------------------------------------
-- Poser des langues sur une sous-organisation est REFUSÉ (un second réglage
-- serait un second endroit où chercher la vérité), mais rattacher une
-- organisation sous une autre est ACCEPTÉ : sa liste revient au défaut plutôt
-- que de bloquer une réorganisation. Même parti que
-- `enforce_branding_root_no_inherit`, qui corrige au lieu d'échouer là où
-- échouer n'aurait servi à rien.
create or replace function public.enforce_languages_root_org()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.parent_id is not null then
    if tg_op = 'INSERT' then
      if new.enabled_languages is distinct from array['fr']::text[] then
        raise exception 'Les langues se paramètrent sur l''organisation principale (racine).';
      end if;
    else
      if new.parent_id is not distinct from old.parent_id
         and new.enabled_languages is distinct from old.enabled_languages then
        raise exception 'Les langues se paramètrent sur l''organisation principale (racine).';
      end if;
      new.enabled_languages := array['fr']::text[];
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_languages_root_org() from public, anon, authenticated;

drop trigger if exists enforce_languages_root_org on public.organizations;
create trigger enforce_languages_root_org
  before insert or update on public.organizations
  for each row execute function public.enforce_languages_root_org();

-- --------------------------------------------------------------------------
-- 3. Langues APPLICABLES à une organisation quelconque
-- --------------------------------------------------------------------------
-- Remontée jusqu'à la racine, faite une fois ici plutôt que réécrite (et
-- faussée) par chaque consommateur — motif `resolve_branding`. Servie par
-- l'API publique (portail usagers) ; l'EXECUTE est réservé au service role,
-- comme `org_subtree_ids` et `resolve_branding`.
create or replace function public.resolve_org_languages(p_org_id uuid)
returns text[]
language sql
stable
set search_path to 'public'
as $$
  with recursive chain as (
    select o.id, o.parent_id, o.enabled_languages, 0 as depth
    from public.organizations o
    where o.id = p_org_id
    union all
    select o.id, o.parent_id, o.enabled_languages, c.depth + 1
    from public.organizations o
    join chain c on o.id = c.parent_id
    where c.depth < 20 -- garde-fou (10 niveaux max, cycles bloqués par enforce_org_depth)
  )
  select c.enabled_languages
  from chain c
  where c.parent_id is null
  limit 1;
$$;

comment on function public.resolve_org_languages(uuid) is
  'Langues applicables à une organisation : celles de son organisation principale (racine). Null si l''organisation n''existe pas.';

revoke all on function public.resolve_org_languages(uuid) from public, anon, authenticated;
grant execute on function public.resolve_org_languages(uuid) to service_role;

-- --------------------------------------------------------------------------
-- 4. Libellés traduits
-- --------------------------------------------------------------------------
-- `procedures.translations` existait déjà (jsonb, toujours vide) : elle prend
-- ici une forme possédée et documentée. `categories.translations` la rejoint.
-- Forme : { "<code>": { "name": "…" } } — un objet par langue, pour que les
-- champs traduits à venir s'ajoutent en clés voisines.
alter table public.categories
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.categories
  drop constraint if exists categories_translations_object_check;
alter table public.categories
  add constraint categories_translations_object_check
  check (jsonb_typeof(translations) = 'object');

alter table public.procedures
  drop constraint if exists procedures_translations_object_check;
alter table public.procedures
  add constraint procedures_translations_object_check
  check (translations is null or jsonb_typeof(translations) = 'object');

comment on column public.categories.translations is
  'Libellés traduits : { "<code de langue>": { "name": "…" } }. Jamais de clé "fr" — le libellé français est la colonne name.';

comment on column public.procedures.translations is
  'Libellés traduits : { "<code de langue>": { "name": "…" } }. Jamais de clé "fr" — le libellé français est la colonne name.';
