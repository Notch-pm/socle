-- ---------------------------------------------------------------------------
-- Correctif de `20260913100000` : l'index d'idempotence doit être INFÉRABLE
-- par `ON CONFLICT` (2026-09-13)
--
-- L'index posé était PARTIEL :
--   unique (contact_id, kind, source_app, source_reference)
--     where source_reference is not null
--
-- PostgREST — donc `contacts-api`, qui écrit par `upsert(..., { onConflict })` —
-- génère `ON CONFLICT (col, col, col, col) DO UPDATE …` **sans clause WHERE**.
-- Or Postgres n'infère un index partiel que si la requête répète son prédicat :
-- sans lui, il lève `42P10 : there is no unique or exclusion constraint
-- matching the ON CONFLICT specification`. La route aurait répondu 500 à
-- CHAQUE consignation de consentement — c'est-à-dire à chaque dépôt.
--
-- Le remplaçant est un index unique ORDINAIRE sur les mêmes colonnes. La
-- sémantique est identique, et ce n'est pas un hasard : dans un index unique,
-- Postgres traite deux NULL comme DISTINCTS (comportement par défaut, celui
-- qu'on garde ici — surtout pas `NULLS NOT DISTINCT`). Un recueil sans
-- `source_reference` n'entre donc en conflit avec rien et s'insère autant de
-- fois qu'il se produit, exactement comme avec le `where` explicite ; un
-- recueil AVEC référence reste unique par dépôt. On a écrit le prédicat que
-- Postgres appliquait déjà.
--
-- ⚠️ Leçon à garder : un index partiel est invisible à `ON CONFLICT` dès que
-- l'appelant ne peut pas exprimer le prédicat — ce qui est le cas de tout
-- client PostgREST. Un index destiné à porter une idempotence d'API ne doit
-- donc jamais être partiel.
-- ---------------------------------------------------------------------------

drop index if exists public.contact_consents_source_unique;

create unique index if not exists contact_consents_source_unique
  on public.contact_consents (contact_id, kind, source_app, source_reference);

comment on index public.contact_consents_source_unique is
  'Un dépôt donné ne consigne qu''un consentement par type : le rejeu met à jour, il ne duplique pas. Index NON partiel, pour rester inférable par ON CONFLICT (PostgREST) ; les recueils sans source_reference se répètent librement, les NULL étant distincts dans un index unique.';
