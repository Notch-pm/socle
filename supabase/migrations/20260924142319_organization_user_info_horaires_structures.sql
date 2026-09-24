-- Horaires d'accueil structurés : `openingHours` n'est plus un texte libre mais
-- une liste de jours `{ day, morningOpen, morningClose, afternoonOpen,
-- afternoonClose }` en `HH:MM`. Seul le commentaire de colonne change : le
-- contrat JSON est validé par son parseur (`userInfo.ts`), pas par la base.
comment on column public.organization_user_info.info is
  'Contrat JSON possede { description, openingHours[{day,morningOpen,morningClose,afternoonOpen,afternoonClose}], faq[{question,answer}] }. Heures HH:MM ; un jour absent est ferme. Textes en Markdown, en francais.';
