alter table public.procedures
  add column if not exists form_schema jsonb;

comment on column public.procedures.form_schema is
  'Étape « Formulaire » : définition du formulaire de la démarche (sections, champs, conditions, pièces jointes typées). Schéma JSON possédé par Socle, contrat public consommé en aval. Écriture soumise aux policies RLS existantes de procedures.';
