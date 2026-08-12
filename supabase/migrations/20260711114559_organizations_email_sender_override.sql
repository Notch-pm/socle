
-- Chaque organisation (racine ou sous-org) peut définir un nom d'expéditeur propre
-- pour ses e-mails. Le toggle `email_sender_override` gouverne l'usage ; le nom est
-- consommé en aval (Ariane/Clara) et par le mail de test au niveau racine.
alter table public.organizations
  add column email_sender_override boolean not null default false,
  add column email_sender_name text;

comment on column public.organizations.email_sender_override is
  'Si vrai, utiliser email_sender_name comme nom d''expéditeur propre à l''organisation.';
comment on column public.organizations.email_sender_name is
  'Nom d''expéditeur spécifique à l''organisation (utilisé si email_sender_override).';
