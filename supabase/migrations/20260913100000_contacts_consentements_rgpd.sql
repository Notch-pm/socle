-- ---------------------------------------------------------------------------
-- Consentements RGPD des usagers (2026-09-13)
--
-- Deux questions posées SYSTÉMATIQUEMENT à l'usager au dépôt d'une demande,
-- quelle que soit la démarche — jamais un champ de `form_schema` :
--   • traitement — « J'accepte que les informations fournies ici soient
--     utilisées dans le cadre du traitement de ma demande. » (OBLIGATOIRE :
--     sans lui, le dépôt n'est pas validable)
--   • partage    — « J'accepte de partager ces informations aux services de
--     <organisme principal> afin d'améliorer le traitement de ma demande et de
--     mes futures demandes. » (facultatif, proposé coché)
--
-- Elles REMPLACENT, dans ce qui est demandé à l'usager, « accepte les mails /
-- accepte les SMS ». Les deux colonnes `consent_email` / `consent_sms` ne sont
-- pas supprimées ici : Clara les écrit et les affiche encore (fiche contact).
-- Elles sont marquées OBSOLÈTES — à retirer quand Clara aura basculé, dans une
-- migration qui lui appartiendra.
--
-- Modèle en DEUX temps, et c'est délibéré :
--   • l'ÉTAT COURANT sur `contacts` — ce qu'un agent lit, ce que l'API sert ;
--   • l'HISTORIQUE dans `contact_consents` — la PREUVE : date, phrase exacte
--     soumise, application et dépôt d'origine. Un booléen seul ne prouve rien
--     (art. 7.1 RGPD : le responsable doit pouvoir démontrer le consentement).
-- L'état ne se met jamais à jour à la main : un trigger le dérive de
-- l'historique, seule écriture possible. Deux sources pour un même fait
-- finiraient par diverger.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. État courant sur la fiche
-- ---------------------------------------------------------------------------

alter table public.contacts
  add column if not exists consent_traitement boolean not null default false,
  add column if not exists consent_traitement_at timestamptz,
  add column if not exists consent_partage boolean not null default false,
  add column if not exists consent_partage_at timestamptz;

comment on column public.contacts.consent_traitement is
  'Consentement RGPD à l''utilisation des informations pour le traitement des demandes. Dérivé de contact_consents par trigger — ne jamais écrire directement.';
comment on column public.contacts.consent_traitement_at is
  'Date du recueil le plus récent du consentement « traitement ».';
comment on column public.contacts.consent_partage is
  'Consentement RGPD au partage des informations aux services de la collectivité (facultatif). Dérivé de contact_consents par trigger — ne jamais écrire directement.';
comment on column public.contacts.consent_partage_at is
  'Date du recueil le plus récent du consentement « partage ».';

comment on column public.contacts.consent_email is
  'OBSOLÈTE (2026-09-13) — remplacé par consent_traitement / consent_partage. Conservé tant que Clara l''écrit ; aucun nouveau consommateur ne doit s''y fier.';
comment on column public.contacts.consent_sms is
  'OBSOLÈTE (2026-09-13) — remplacé par consent_traitement / consent_partage. Conservé tant que Clara l''écrit ; aucun nouveau consommateur ne doit s''y fier.';

-- ---------------------------------------------------------------------------
-- 2. Historique — la preuve
-- ---------------------------------------------------------------------------

create table if not exists public.contact_consents (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  -- Dénormalisée depuis le contact (posée par trigger) : la lecture RLS se fait
  -- alors sans jointure, comme pour contact_external_references.
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null
    constraint contact_consents_kind_check check (kind in ('traitement', 'partage')),
  granted boolean not null,
  -- La phrase EXACTE soumise à l'usager ce jour-là. C'est elle qui fait la
  -- preuve, pas le booléen : la collectivité peut être renommée, le libellé
  -- reformulé — ce qui a été accepté ne change pas.
  statement text not null
    constraint contact_consents_statement_check check (btrim(statement) <> ''),
  -- Application qui a recueilli le consentement (iris, nora, clara…). Code
  -- libre : le référentiel n'a pas à connaître le catalogue des applications.
  source_app text not null
    constraint contact_consents_source_app_check check (btrim(source_app) <> ''),
  -- Dépôt d'origine, tel que l'application le désigne (UUID nu d'une demande
  -- Iris, référence d'un dossier…). Aucune FK : la frontière de projet ne se
  -- franchit jamais par une clé étrangère.
  source_reference text,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.contact_consents is
  'Historique des consentements RGPD d''un usager : une ligne par recueil, avec la phrase exacte soumise, l''application et le dépôt d''origine. Append-only côté métier ; l''état courant de la fiche en est dérivé par trigger. Écriture via contacts-api (service role) uniquement.';
comment on column public.contact_consents.organization_id is
  'Copie de contacts.organization_id, posée automatiquement par trigger — support de la lecture RLS sans jointure.';
comment on column public.contact_consents.statement is
  'Libellé soumis à l''usager au moment du recueil, nom de l''organisme principal déjà interpolé. Jamais réécrit.';
comment on column public.contact_consents.source_reference is
  'Dépôt d''origine (UUID nu d''une demande, référence de dossier). Sans FK : référence inter-projets.';
comment on column public.contact_consents.collected_at is
  'Date du recueil — celle qui fait foi, éventuellement antérieure à created_at (reprise, dépôt papier consigné plus tard).';

create index if not exists contact_consents_contact_kind_idx
  on public.contact_consents (contact_id, kind, collected_at desc);

create index if not exists contact_consents_organization_idx
  on public.contact_consents (organization_id);

-- Idempotence : rejouer le MÊME dépôt (même application, même référence) ne
-- crée pas une seconde ligne — il met la première à jour. Sans quoi une
-- edge function qui réessaie après un échec réseau doublerait l'historique.
create unique index if not exists contact_consents_source_unique
  on public.contact_consents (contact_id, kind, source_app, source_reference)
  where source_reference is not null;

comment on index public.contact_consents_source_unique is
  'Un dépôt donné ne consigne qu''un consentement par type : le rejeu met à jour, il ne duplique pas.';

-- ---------------------------------------------------------------------------
-- 3. organization_id toujours dérivée du contact (motif contact_external_references)
-- ---------------------------------------------------------------------------

create or replace function public.sync_contact_consent_org()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  select organization_id into new.organization_id
  from public.contacts where id = new.contact_id;
  if new.organization_id is null then
    raise exception 'contact_consents : contact % introuvable.', new.contact_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.sync_contact_consent_org() from public, anon, authenticated;

drop trigger if exists t01_contact_consents_org on public.contact_consents;
create trigger t01_contact_consents_org
  before insert or update on public.contact_consents
  for each row execute function public.sync_contact_consent_org();

-- ---------------------------------------------------------------------------
-- 4. L'état courant de la fiche est DÉRIVÉ de l'historique
--
-- Seul recueil le PLUS RÉCENT qui compte (`collected_at`), et jamais un plus
-- ancien : consigner après coup un dépôt papier de l'an dernier ne doit pas
-- effacer un consentement retiré la semaine dernière.
-- ---------------------------------------------------------------------------

create or replace function public.sync_contact_consent_state()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.kind = 'traitement' then
    update public.contacts
      set consent_traitement = new.granted,
          consent_traitement_at = new.collected_at,
          updated_at = now()
    where id = new.contact_id
      and (consent_traitement_at is null or consent_traitement_at <= new.collected_at);
  elsif new.kind = 'partage' then
    update public.contacts
      set consent_partage = new.granted,
          consent_partage_at = new.collected_at,
          updated_at = now()
    where id = new.contact_id
      and (consent_partage_at is null or consent_partage_at <= new.collected_at);
  end if;
  return null;
end;
$$;

revoke execute on function public.sync_contact_consent_state() from public, anon, authenticated;

drop trigger if exists t02_contact_consents_state on public.contact_consents;
create trigger t02_contact_consents_state
  after insert or update on public.contact_consents
  for each row execute function public.sync_contact_consent_state();

-- ---------------------------------------------------------------------------
-- 5. RLS — lecture par les membres de l'organisation, AUCUNE écriture cliente
--    (motif contact_external_references : l'écriture passe par contacts-api,
--    en service role, hors RLS).
-- ---------------------------------------------------------------------------

alter table public.contact_consents enable row level security;

drop policy if exists "read contact_consents" on public.contact_consents;
create policy "read contact_consents"
  on public.contact_consents for select
  to authenticated
  using (public.has_org_access(organization_id));
