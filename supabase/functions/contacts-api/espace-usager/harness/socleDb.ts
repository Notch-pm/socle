/**
 * Base Socle de test : un schéma RÉDUIT du référentiel des usagers (contacts,
 * références externes, consentements, clés d'API, organisations) sur PGlite,
 * avec les invariants et déclencheurs qui comptent pour l'espace usager copiés
 * des migrations d'origine — puis la VRAIE migration
 * `20261020120000_contacts_citizen.sql` (scope `citizen`, `citizen_contact_link`).
 *
 * Copiés tels quels de leurs migrations :
 *   · `normalize_name`            (20260717071822_contacts_match_identites) ;
 *   · l'unicité (organisation, source, identifiant externe), la dérivation de
 *     l'organisation (20260715152447_contacts_referentiel_usagers) ;
 *   · l'état de consentement dérivé de l'historique (20260913100000_…).
 * `immutable_unaccent` est une doublure par `translate` ; le périmètre d'une
 * clé plateforme (`application_scope_ids`) lit une table d'abonnements réduite.
 *
 * Lancer : `npx vitest run supabase/functions/contacts-api/espace-usager`.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = join(import.meta.dirname, "..", "..", "..", "..", "migrations", "20261020120000_contacts_citizen.sql");

const STUB_SCHEMA = `
  create role anon; create role authenticated; create role service_role;

  create function public.immutable_unaccent(t text) returns text language sql immutable
    as $$ select translate(t,
      'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
      'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY') $$;
  create or replace function public.normalize_name(value text) returns text
  language sql immutable parallel safe set search_path = ''
  as $$ select nullif(btrim(regexp_replace(lower(public.immutable_unaccent(coalesce(value, ''))), '[^a-z0-9]+', ' ', 'g')), '') $$;

  create table public.organizations (id uuid primary key default gen_random_uuid(), parent_id uuid references public.organizations(id), name text);
  create table public.org_applications (organization_id uuid not null references public.organizations(id), application text not null);
  create function public.application_scope_ids(p_application text) returns uuid[] language sql stable
    as $$ select coalesce(array_agg(organization_id), '{}') from public.org_applications where application = p_application $$;

  create table public.api_keys (
    id uuid primary key default gen_random_uuid(), organization_id uuid, key_hash text unique not null,
    scopes text[] not null default '{}', consumer text, revoked_at timestamptz, expires_at timestamptz, last_used_at timestamptz,
    constraint api_keys_scopes_known check (scopes <@ array['read','contacts','smtp','ai','audience','integrations','signatures']::text[]));

  create table public.contacts (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    contact_type text not null constraint contacts_type_check check (contact_type in ('personne','entreprise','association','administration')),
    civility text constraint contacts_civility_check check (civility in ('madame','monsieur')),
    first_name text, last_name text, usage_name text, birth_date date,
    legal_name text, siret text,
    email text, mobile_phone text, landline_phone text,
    address_line1 text, address_line2 text, postal_code text, city text, country text not null default 'France',
    consent_traitement boolean not null default false, consent_traitement_at timestamptz,
    consent_partage boolean not null default false, consent_partage_at timestamptz,
    internal_notes text,
    status text not null default 'active' constraint contacts_status_check check (status in ('active','archived')),
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    constraint contacts_civility_by_type check ((contact_type = 'personne') = (civility is not null)),
    constraint contacts_legal_name_by_type check ((contact_type <> 'personne') = (legal_name is not null)));

  create table public.contact_external_references (
    id uuid primary key default gen_random_uuid(),
    contact_id uuid not null references public.contacts(id) on delete cascade,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    source text not null constraint contact_external_references_source_check check (btrim(source) <> ''),
    external_id text not null constraint contact_external_references_external_id_check check (btrim(external_id) <> ''),
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    constraint contact_external_references_contact_source_unique unique (contact_id, source));
  create unique index contact_external_refs_org_source_ext_unique
    on public.contact_external_references (organization_id, source, external_id);
  create function public.sync_contact_external_ref_org() returns trigger language plpgsql security definer set search_path to 'public'
  as $$ begin
    select organization_id into new.organization_id from public.contacts where id = new.contact_id;
    if new.organization_id is null then raise exception 'Contact introuvable pour la reference externe'; end if;
    return new; end; $$;
  create trigger trg_sync_contact_external_ref_org before insert or update on public.contact_external_references
    for each row execute function public.sync_contact_external_ref_org();

  create table public.contact_consents (
    id uuid primary key default gen_random_uuid(),
    contact_id uuid not null references public.contacts(id) on delete cascade,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    kind text not null constraint contact_consents_kind_check check (kind in ('traitement','partage')),
    granted boolean not null,
    statement text not null constraint contact_consents_statement_check check (btrim(statement) <> ''),
    source_app text not null constraint contact_consents_source_app_check check (btrim(source_app) <> ''),
    source_reference text,
    collected_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
  create function public.sync_contact_consent_org() returns trigger language plpgsql security definer set search_path to 'public'
  as $$ begin
    select organization_id into new.organization_id from public.contacts where id = new.contact_id;
    if new.organization_id is null then raise exception 'contact_consents : contact % introuvable.', new.contact_id; end if;
    return new; end; $$;
  create trigger t01_contact_consents_org before insert or update on public.contact_consents
    for each row execute function public.sync_contact_consent_org();
  create function public.sync_contact_consent_state() returns trigger language plpgsql security definer set search_path to 'public'
  as $$ begin
    if new.kind = 'traitement' then
      update public.contacts set consent_traitement = new.granted, consent_traitement_at = new.collected_at
       where id = new.contact_id and (consent_traitement_at is null or consent_traitement_at <= new.collected_at);
    elsif new.kind = 'partage' then
      update public.contacts set consent_partage = new.granted, consent_partage_at = new.collected_at
       where id = new.contact_id and (consent_partage_at is null or consent_partage_at <= new.collected_at);
    end if;
    return null; end; $$;
  create trigger t02_contact_consents_state after insert or update on public.contact_consents
    for each row execute function public.sync_contact_consent_state();
`;

let shared: PGlite | null = null;

export async function createSocleDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(STUB_SCHEMA);
  await db.exec(readFileSync(MIGRATION, "utf8"));
  return db;
}

export async function freshSocleDb(): Promise<PGlite> {
  if (shared === null) {
    shared = await createSocleDb();
    return shared;
  }
  await shared.exec(`truncate table public.contact_consents, public.contact_external_references, public.contacts,
    public.api_keys, public.org_applications, public.organizations restart identity cascade`);
  return shared;
}
