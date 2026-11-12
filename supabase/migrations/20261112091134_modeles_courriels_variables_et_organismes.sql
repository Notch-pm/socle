-- Modèles de courriels, deuxième temps (décisions du 2026-11-12) :
--  1. UN SEUL catalogue de variables pour la gamme — celui d'Iris, qui les
--     remplit, plus les variables que seuls les courriels système fournissent ;
--     la base REFUSE une variable inconnue (comme Iris le fait déjà chez lui).
--  2. Activation d'un modèle CRÉÉ organisme par organisme (motif Iris
--     `email_template_organizations`) : un modèle neuf n'est proposé nulle part,
--     et cocher la racine n'ouvre pas ses services.

-- 1a. Les variables communes : disponibles sur toute demande, donc dans tout
--     modèle. ⚠️ Jumeau exact de `EMAIL_COMMON_VARIABLES` (emailVariables.ts) —
--     un test compare les deux listes.
create or replace function public.email_template_common_variables()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'usager.salutation',
    'usager.civilite',
    'usager.prenom',
    'usager.nom',
    'usager.nom_complet',
    'usager.raison_sociale',
    'usager.courriel',
    'usager.telephone',
    'usager.adresse',
    'demande.reference',
    'demande.objet',
    'demande.description',
    'demande.statut',
    'demande.priorite',
    'demande.demarche',
    'demande.categorie',
    'demande.destinataire',
    'demande.canal',
    'demande.date_depot',
    'demande.date_instruction',
    'demande.date_cloture',
    'demande.date_echeance',
    'demande.motif_cloture',
    'agent.nom',
    'organisation.nom'
  ]::text[]
$$;

-- 1b. Les clés citées par un texte : `{{cle}}` et les sections `{{#cle}}`,
--     `{{^cle}}`, `{{/cle}}`. Jumeau de `extractVariables` (emailTemplates.ts).
create or replace function public.email_template_text_variables(p_text text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(distinct m[1]), '{}')
  from regexp_matches(coalesce(p_text, ''), '\{\{\s*[#/^]?\s*([a-zA-Z0-9_.]+)\s*\}\}', 'g') as m
$$;

-- 1c. Les courriels système passent au catalogue commun : trois clés changent
--     de nom (le reste existait déjà sous le même nom chez Iris).
update public.email_template_defaults
set subject = replace(replace(replace(subject,
      'demande.libelle_demarche', 'demande.demarche'),
      'demande.organisme_responsable', 'demande.destinataire'),
      'organisme.nom', 'organisation.nom'),
    body = replace(replace(replace(body,
      'demande.libelle_demarche', 'demande.demarche'),
      'demande.organisme_responsable', 'demande.destinataire'),
      'organisme.nom', 'organisation.nom'),
    variables = array(
      select case v
        when 'demande.libelle_demarche' then 'demande.demarche'
        when 'demande.organisme_responsable' then 'demande.destinataire'
        when 'organisme.nom' then 'organisation.nom'
        else v end
      from unnest(variables) as v
    );

-- 1d. Garde : un texte ne cite que les variables communes, plus — pour un
--     courriel système — celles que son application fournit (`variables` du
--     catalogue). Même parti qu'Iris (`t03_email_templates_guard_variables`) :
--     un modèle accepté ici ne doit jamais être refusé en aval.
create or replace function public.guard_email_template_variables()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed text[] := public.email_template_common_variables();
  unknown text[];
begin
  if new.system_key is not null then
    allowed := allowed || coalesce(
      (select variables from public.email_template_defaults where key = new.system_key), '{}');
  end if;
  select coalesce(array_agg(v order by v), '{}') into unknown
  from unnest(public.email_template_text_variables(new.subject || ' ' || new.body)) as v
  where not v = any(allowed);
  if array_length(unknown, 1) > 0 then
    raise exception 'Variable(s) inconnue(s) : %', array_to_string(unknown, ', ')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_email_template_variables() from public, anon, authenticated;

create trigger trg_guard_email_template_variables
  before insert or update of subject, body, system_key on public.email_templates
  for each row execute function public.guard_email_template_variables();

-- 2. Activation d'un modèle CRÉÉ par organisme. Pas de descendance implicite :
--    chaque organisme est coché nommément (motif Iris). Les courriels système
--    valent partout — ils n'ont pas de ligne ici.
create table public.email_template_organizations (
  email_template_id uuid not null references public.email_templates(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (email_template_id, organization_id)
);

create index idx_email_template_organizations_org
  on public.email_template_organizations (organization_id);

-- L'organisme doit appartenir à l'arbre de la racine du modèle, et le modèle
-- être un modèle créé. Aucune FK ne peut tenir la première règle.
create or replace function public.enforce_email_template_organization_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tpl_root uuid;
  tpl_system text;
  org_root uuid;
begin
  select organization_id, system_key into tpl_root, tpl_system
  from public.email_templates where id = new.email_template_id;
  if tpl_system is not null then
    raise exception 'Un courriel systeme vaut pour tous les organismes : il ne s''active pas organisme par organisme';
  end if;
  with recursive up as (
    select id, parent_id from public.organizations where id = new.organization_id
    union all
    select o.id, o.parent_id from public.organizations o join up on o.id = up.parent_id
  )
  select id into org_root from up where parent_id is null;
  if org_root is distinct from tpl_root then
    raise exception 'L''organisme n''appartient pas a la collectivite du modele';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_email_template_organization_scope()
  from public, anon, authenticated;

create trigger trg_enforce_email_template_organization_scope
  before insert or update on public.email_template_organizations
  for each row execute function public.enforce_email_template_organization_scope();

alter table public.email_template_organizations enable row level security;

create policy "read email_template_organizations" on public.email_template_organizations
  for select to authenticated using (
    exists (
      select 1 from public.email_templates t
      where t.id = email_template_id and has_org_access(t.organization_id)
    )
  );

create policy "write email_template_organizations" on public.email_template_organizations
  for all to authenticated
  using (
    exists (
      select 1 from public.email_templates t
      where t.id = email_template_id and t.system_key is null and is_org_admin(t.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.email_templates t
      where t.id = email_template_id and t.system_key is null and is_org_admin(t.organization_id)
    )
  );
