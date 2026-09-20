-- `assistant` rejoint les mots réservés d'un slug d'organisation : depuis le
-- 2026-09-20, le portail usagers sert l'assistant conversationnel de la
-- collectivité à l'adresse `/assistant`. Un organisme de ce slug aurait la même
-- adresse que lui (`/<slug>` ouvre la page de l'organisme).
--
-- Même motif que `accessibilite` (migration `organization_slug_url`) : le
-- réserver coûte une ligne ; le récupérer plus tard demanderait de renommer
-- l'adresse d'un organisme déjà communiquée.
--
-- Aucune ligne existante ne casse : aucun organisme ne porte ce slug, vérifié
-- avant d'écrire cette migration. Miroir : `SLUG_RESERVED` dans
-- `src/features/organizations/organizationSlug.ts`.

alter table public.organizations
  drop constraint if exists organizations_slug_url_form;

alter table public.organizations
  add constraint organizations_slug_url_form check (
    slug is null
    or (
      slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      and length(slug) >= 4
      and slug not in ('demarches', 'accueil', 'contact', 'mentions-legales', 'accessibilite', 'assistant')
    )
  );
