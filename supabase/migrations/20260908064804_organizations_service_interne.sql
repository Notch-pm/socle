-- Services internes : instruire sans apparaitre au portail.
--
-- Une collectivite decoupe son organigramme plus finement que ce qu'elle veut
-- montrer a ses usagers. « Etat civil », « Direction du Cabinet » instruisent
-- des demandes, mais un usager du portail n'a pas a choisir entre eux : il
-- s'adresse a SA MAIRIE. Marquer une sous-organisation « service interne » la
-- retire du portail ; c'est son premier ancetre non interne — son PORTEUR —
-- qui est nomme a sa place, meme s'il n'a pas active la demarche lui-meme.
--
-- Le reglage gouverne l'usage, pas la donnee (motif `email_sender_name`,
-- `branding_inherit_parent`) : decocher la case rend l'organisme au portail
-- sans que rien n'ait ete perdu entre-temps.

-- --------------------------------------------------------------------------
-- 1. La colonne
-- --------------------------------------------------------------------------
alter table public.organizations
  add column if not exists is_internal_service boolean not null default false;

comment on column public.organizations.is_internal_service is
  'true = ce service n''apparait pas sur le portail usagers : les demarches qu''il instruit y sont presentees au nom de son porteur (premier ancetre non interne). Toujours false sur une organisation principale (racine), qui n''a personne au-dessus d''elle pour la porter.';

-- Aucune reprise de donnees : la notion n'existait pas, aucune ligne n'est
-- concernee. Le defaut `false` dit exactement ce qui etait vrai jusqu'ici.

-- --------------------------------------------------------------------------
-- 2. Une racine n'est jamais un service interne
-- --------------------------------------------------------------------------
-- C'est l'invariant qui fait tenir tout le reste : sans lui, un service
-- interne pourrait n'avoir aucun porteur, et ses demarches disparaitraient du
-- portail au lieu d'y etre presentees sous un autre nom.
alter table public.organizations
  drop constraint if exists organizations_internal_service_not_root;
alter table public.organizations
  add constraint organizations_internal_service_not_root check (
    is_internal_service = false or parent_id is not null
  );

-- On CORRIGE au lieu de refuser, motif `enforce_branding_root_no_inherit` :
-- promouvoir un service interne en racine (parent_id := null) est une
-- reorganisation legitime, et echouer la bloquerait sans rien proteger. Le
-- trigger etant BEFORE, le CHECK ci-dessus ne voit que la valeur corrigee.
create or replace function public.enforce_internal_service_not_root() returns trigger
    language plpgsql security definer
    set search_path to 'public'
as $$
begin
  if new.parent_id is null then
    new.is_internal_service := false;
  end if;
  return new;
end;
$$;

alter function public.enforce_internal_service_not_root() owner to postgres;
revoke all on function public.enforce_internal_service_not_root() from public, anon, authenticated;

drop trigger if exists enforce_internal_service_not_root on public.organizations;
create trigger enforce_internal_service_not_root
  before insert or update on public.organizations
  for each row execute function public.enforce_internal_service_not_root();

-- --------------------------------------------------------------------------
-- 3. Le porteur d'une organisation
-- --------------------------------------------------------------------------
-- Premier ancetre (l'organisation comprise) qui n'est PAS un service interne.
-- La remontee s'arrete d'elle-meme sur ce noeud (`where c.is_internal_service`)
-- et se termine toujours, puisqu'une racine n'est jamais interne.
-- Meme forme que `resolve_branding`.
create or replace function public.internal_service_bearer(p_org_id uuid)
returns uuid
    language sql stable security definer
    set search_path to 'public'
as $$
  with recursive chain as (
    select o.id, o.parent_id, o.is_internal_service, 0 as depth
    from public.organizations o
    where o.id = p_org_id
    union all
    select o.id, o.parent_id, o.is_internal_service, c.depth + 1
    from public.organizations o
    join chain c on o.id = c.parent_id
    where c.is_internal_service
      and c.depth < 20 -- garde-fou (10 niveaux max, cycles bloques par enforce_org_depth)
  )
  select c.id from chain c
  where not c.is_internal_service
  order by c.depth
  limit 1;
$$;

comment on function public.internal_service_bearer(uuid) is
  'Organisme qui represente cette organisation au portail : elle-meme, ou le premier ancetre qui n''est pas un service interne.';

alter function public.internal_service_bearer(uuid) owner to postgres;
revoke all on function public.internal_service_bearer(uuid) from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- 4. Une demarche, un seul instructeur par porteur
-- --------------------------------------------------------------------------
-- Si deux services internes de la meme mairie activaient « Acte de naissance »,
-- on ne saurait pas a quel service rattacher la demande deposee au nom de la
-- mairie. La mairie elle-meme compte dans le groupe : activer chez elle ET
-- chez l'un de ses services internes pose exactement la meme question.
--
-- Un CHECK ne peut pas lire d'autres lignes (cf. `enforce_contact_role_same_org`)
-- et le porteur n'est pas une colonne : ni contrainte declarative, ni index
-- partiel. La regle est donc ecrite UNE FOIS, ici, et appliquee par les deux
-- triggers ci-dessous — les deux seuls gestes qui peuvent la rompre.
--
-- Le STATUT (active/obsolete) n'entre pas dans la regle : c'est une contrainte
-- de coherence du parametrage, pas d'affichage. Reactiver une organisation
-- obsolete ne doit pas reveler un conflit dormant.
create or replace function public.internal_service_offer_conflicts(p_org_id uuid)
returns table (
  bearer_id uuid,
  bearer_name text,
  procedure_id uuid,
  procedure_name text,
  organization_names text[]
)
    language sql stable security definer
    set search_path to 'public'
as $$
  with recursive
  -- La racine de l'organisation examinee : la regle se verifie sur toute la
  -- collectivite, les porteurs pouvant etre a n'importe quel niveau.
  ancestry as (
    select o.id, o.parent_id, 0 as depth
    from public.organizations o
    where o.id = p_org_id
    union all
    select o.id, o.parent_id, a.depth + 1
    from public.organizations o
    join ancestry a on o.id = a.parent_id
    where a.depth < 20
  ),
  subtree as (
    select o.id, o.parent_id, o.is_internal_service
    from public.organizations o
    where o.id = (select a.id from ancestry a where a.parent_id is null limit 1)
    union all
    select o.id, o.parent_id, o.is_internal_service
    from public.organizations o
    join subtree s on o.parent_id = s.id
  ),
  -- Le porteur de chaque organisation du sous-arbre : une organisation non
  -- interne est son propre porteur, une organisation interne prend celui de
  -- son parent. La racine n'etant jamais interne, tout le sous-arbre est
  -- atteint.
  bearer as (
    select s.id as org_id, s.id as bearer_id
    from subtree s
    where not s.is_internal_service
    union all
    select s.id, b.bearer_id
    from subtree s
    join bearer b on s.parent_id = b.org_id
    where s.is_internal_service
  )
  select
    b.bearer_id,
    porteur.name,
    op.procedure_id,
    p.name,
    array_agg(o.name order by o.name)
  from public.organization_procedures op
  join bearer b on b.org_id = op.organization_id
  join public.organizations o on o.id = op.organization_id
  join public.organizations porteur on porteur.id = b.bearer_id
  join public.procedures p on p.id = op.procedure_id
  where op.is_enabled
  group by b.bearer_id, porteur.name, op.procedure_id, p.name
  having count(distinct op.organization_id) > 1;
$$;

comment on function public.internal_service_offer_conflicts(uuid) is
  'Les couples (porteur, demarche) instruits par plus d''une organisation dans la collectivite de p_org_id. Vide = parametrage coherent.';

alter function public.internal_service_offer_conflicts(uuid) owner to postgres;
revoke all on function public.internal_service_offer_conflicts(uuid) from public, anon, authenticated;

-- 4.a — a l'activation d'une demarche.
--
-- AFTER et non BEFORE : la regle est un agregat sur la table, elle doit voir
-- la ligne qu'on vient d'ecrire. Le filtre sur `procedure_id` est essentiel —
-- un conflit preexistant sur une AUTRE demarche ne doit pas bloquer une
-- activation sans rapport.
create or replace function public.enforce_single_offer_per_bearer() returns trigger
    language plpgsql security definer
    set search_path to 'public'
as $$
declare
  conflict record;
  self_name text;
  others text[];
begin
  if new.organization_id is null or new.procedure_id is null or new.is_enabled is not true then
    return null;
  end if;

  select c.* into conflict
  from public.internal_service_offer_conflicts(new.organization_id) c
  where c.procedure_id = new.procedure_id
  limit 1;

  if found then
    select o.name into self_name from public.organizations o where o.id = new.organization_id;
    others := array_remove(conflict.organization_names, self_name);
    raise exception 'Cette démarche est déjà activée par « % ». Une même démarche ne peut être instruite que par un seul service au sein de « % ».',
      array_to_string(others, ' », « '), conflict.bearer_name;
  end if;

  return null;
end;
$$;

alter function public.enforce_single_offer_per_bearer() owner to postgres;
revoke all on function public.enforce_single_offer_per_bearer() from public, anon, authenticated;

drop trigger if exists enforce_single_offer_per_bearer on public.organization_procedures;
create trigger enforce_single_offer_per_bearer
  after insert or update on public.organization_procedures
  for each row execute function public.enforce_single_offer_per_bearer();

-- 4.b — quand on coche « service interne », ou qu'on deplace un service.
--
-- Le meme conflit peut naitre sans qu'aucune activation ne bouge : deux
-- services freres portent chacun la demarche, puis on les rattache au meme
-- porteur. On ne regarde que les conflits du porteur de NEW : marquer une
-- organisation interne ne change les porteurs que dans son propre sous-arbre,
-- et un rattachement ne peut faire naitre un conflit que du cote d'arrivee.
create or replace function public.enforce_no_offer_conflict_on_bearer() returns trigger
    language plpgsql security definer
    set search_path to 'public'
as $$
declare
  conflict record;
begin
  select c.* into conflict
  from public.internal_service_offer_conflicts(new.id) c
  where c.bearer_id = public.internal_service_bearer(new.id)
  limit 1;

  if found then
    raise exception 'Impossible : la démarche « % » serait alors instruite à la fois par « % », au sein de « % ».',
      conflict.procedure_name,
      array_to_string(conflict.organization_names, ' » et « '),
      conflict.bearer_name;
  end if;

  return null;
end;
$$;

alter function public.enforce_no_offer_conflict_on_bearer() owner to postgres;
revoke all on function public.enforce_no_offer_conflict_on_bearer() from public, anon, authenticated;

drop trigger if exists enforce_no_offer_conflict_on_bearer on public.organizations;
create trigger enforce_no_offer_conflict_on_bearer
  after update of is_internal_service, parent_id on public.organizations
  for each row execute function public.enforce_no_offer_conflict_on_bearer();
