alter table public.procedures
  add column if not exists requester_config jsonb;

comment on column public.procedures.requester_config is
  'Étape « Informations demandeur » : données demandées au requérant, par public (citoyen/entreprise/association) et par champ (obligatoire/visible/masque). Écriture soumise aux policies RLS existantes de procedures.';
