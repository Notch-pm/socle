-- Rapprochement d'identités (contacts-api /match) : similarité trigram et
-- suppression des accents. Installées dans le schéma `extensions` (comme
-- PostGIS), jamais dans `public`.
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
