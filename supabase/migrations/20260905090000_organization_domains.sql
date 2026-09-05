-- Domaines du portail usagers — le rattachement `hostname → collectivité`.
--
-- Le portail (Nora) est une application UNIQUE servant toutes les collectivités :
-- `nantes.edilumen.fr`, `angers.edilumen.fr`, `demarches.ville-de-rennes.fr`…
-- Il n'embarque aucune liste de collectivités et ne connaît aucun tenant à
-- l'avance : il demande au Socle « à qui appartient ce domaine ? ». Cette table
-- EST la réponse, et donc la seule configuration tenant-specific du portail.
-- Ajouter une collectivité au portail = insérer une ligne ici, sans redéploiement.
--
-- Pourquoi une table plutôt que `organizations.slug` : un sous-domaine dérivé du
-- slug imposerait la convention `<slug>.edilumen.fr` au portail — c'est-à-dire un
-- mapping dans le code du consommateur, exactement ce que cette table évite. Une
-- collectivité doit pouvoir arriver avec SON domaine (`demarches.nantes.fr`), et
-- en avoir plusieurs (bascule d'un ancien domaine, redirection canonique).
--
-- Pas de restriction à une organisation racine (contrairement à `quartiers` ou
-- `document_templates`) : un domaine appartient à qui l'exploite, et une
-- sous-organisation qui gère son propre guichet doit pouvoir en porter un.

create table public.organization_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Nom d'hôte complet, normalisé : minuscules, sans port, sans point final.
  hostname text not null,
  -- Domaine canonique de la collectivité : celui à écrire dans un lien (mail
  -- d'accusé de réception, notification). Les autres restent servis à
  -- l'identique — `is_primary` ne dit pas « le seul valide », il dit « celui
  -- qu'on écrit ».
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),

  -- FQDN en minuscules, au moins deux labels. Un nom d'hôte à label unique
  -- (`localhost`) est refusé : ce n'est jamais un domaine de production, et le
  -- développement passe par PORTAL_DEV_HOSTNAME côté portail, qui désigne un
  -- domaine RÉEL de cette table. La normalisation étant faite par le trigger
  -- ci-dessous, cette contrainte n'a plus qu'à valider la forme.
  constraint organization_domains_hostname_check check (
    length(hostname) between 4 and 253
    and hostname ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  )
);

-- Unicité GLOBALE, pas par organisation : un domaine désigne exactement une
-- collectivité. C'est l'invariant sur lequel repose toute la résolution du
-- portail — deux lignes concurrentes rendraient le tenant indéterminé.
create unique index organization_domains_hostname_unique
  on public.organization_domains (hostname);

-- Au plus un domaine canonique par organisation.
create unique index organization_domains_primary_unique
  on public.organization_domains (organization_id)
  where is_primary;

create index idx_organization_domains_org on public.organization_domains (organization_id);

-- Normalisation à l'écriture plutôt qu'à la lecture : le nom d'hôte est une clé
-- de recherche (un `eq` sur la valeur reçue du navigateur). Normaliser des deux
-- côtés d'une comparaison est une source d'écart permanente ; on stocke donc la
-- forme canonique, et la résolution n'a plus qu'à normaliser son entrée.
create or replace function public.normalize_organization_domain()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.hostname := rtrim(lower(btrim(new.hostname)), '.');
  return new;
end;
$$;

-- Les trois rôles, pas seulement `public` : Supabase pose des DEFAULT PRIVILEGES
-- qui accordent EXECUTE nommément à anon/authenticated (cf. migration
-- branding_functions_revoke_execute). Sans effet sur le déclenchement du trigger.
revoke execute on function public.normalize_organization_domain()
  from public, anon, authenticated;

create trigger trg_normalize_organization_domain
  before insert or update on public.organization_domains
  for each row execute function public.normalize_organization_domain();

-- RLS : lecture pour les membres de l'organisation, écriture pour ses admins
-- (is_org_admin court-circuite déjà le super admin) — calqué sur
-- document_templates. L'API publique lit en service role, hors RLS, bornée par
-- le périmètre de la clé.
alter table public.organization_domains enable row level security;

create policy "read organization_domains" on public.organization_domains
  for select to authenticated using (has_org_access(organization_id));

create policy "write organization_domains" on public.organization_domains
  for all to authenticated
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));

comment on table public.organization_domains is
  'Domaines du portail usagers : rattachement hostname → organisation. Source de verite de la resolution de tenant du portail (GET /v1/portal/tenant). Un hostname designe exactement une organisation.';
comment on column public.organization_domains.hostname is
  'Nom d''hote complet, normalise par trigger (minuscules, sans point final). Unique sur toute la base.';
comment on column public.organization_domains.is_primary is
  'Domaine canonique de l''organisation : celui a ecrire dans un lien. Les autres domaines restent servis a l''identique.';
