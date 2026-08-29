-- Rattachement d'une clé API à l'APPLICATION qui l'utilise.
--
-- Prépare la comptabilité de consommation IA (migration suivante) : le journal
-- doit pouvoir dire « Iris a dépensé tant, Clara tant » alors que le plafond,
-- lui, reste global à la collectivité. L'attribution est donc portée par la
-- CLÉ, jamais par le corps de la requête — un appelant ne peut pas se tromper
-- de compte à débiter, ni imputer sa dépense à un voisin.
--
-- Motif : « périmètre dérivé de la clé, jamais d'un en-tête ni d'un payload »,
-- la règle déjà appliquée par toutes les API de la gamme pour l'organisation.
--
-- Nullable : les clés existantes (référentiel, usagers) n'ont pas à être
-- rattachées. Seules les clés portant le scope « ai » l'exigeront, et c'est la
-- fonction ai-api qui le vérifiera — pas une contrainte de table, qui casserait
-- les clés en service.

alter table public.api_keys
  add column if not exists consumer text;

-- Un identifiant technique court et stable : il devient une valeur de
-- regroupement dans le journal et sur les écrans. Pas d'espaces, pas
-- d'accents, pas de majuscules — « iris », « clara », « ariane ».
alter table public.api_keys
  drop constraint if exists api_keys_consumer_format;
alter table public.api_keys
  add constraint api_keys_consumer_format
  check (consumer is null or consumer ~ '^[a-z][a-z0-9_-]{1,31}$');

comment on column public.api_keys.consumer is
  'Application consommatrice (« iris », « clara »…). Sert à IMPUTER la consommation IA dans ai_usage_events. Obligatoire pour une clé portant le scope « ai » (vérifié par ai-api, pas par la table). Une clé = une application : partagée, la ventilation s''effondre en un seul seau.';
