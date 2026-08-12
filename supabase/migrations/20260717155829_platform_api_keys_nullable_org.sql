alter table public.api_keys alter column organization_id drop not null;

comment on column public.api_keys.organization_id is
  'Organisation (racine) liée à la clé. NULL = clé PLATEFORME : périmètre = toutes les organisations, toutes racines confondues (liaison unique Socle↔Clara). Pour contacts-api, une clé plateforme exige l''en-tête X-Organization-Id (le référentiel servi est la racine de cette organisation).';
