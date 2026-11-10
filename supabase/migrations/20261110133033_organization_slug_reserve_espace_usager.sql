-- `suivi`, `compte` et `notifications` rejoignent les mots réservés d'un slug
-- d'organisation : le portail usagers (Nora) sert à la racine de la
-- collectivité l'accès invité d'une demande (`/suivi`), l'espace usager
-- (`/compte`, dont « Mes demandes ») et la page de désinscription des avis à
-- l'usager d'Iris (`/notifications/desinscription`, B12, lien porté par chaque
-- avis de statut et par l'en-tête List-Unsubscribe). Un organisme de ce slug
-- aurait la même adresse (`/<slug>` ouvre la page de l'organisme). Même motif
-- que `assistant` et `courrier` : le réserver coûte une ligne ; le récupérer
-- plus tard demanderait de renommer l'adresse d'un organisme déjà communiquée.
--
-- Aucun organisme ne porte ces slugs — vérifié le 2026-11-10 avant d'écrire
-- cette migration, et revérifié ici : la contrainte ne se pose pas sur une
-- ligne qui la viole. Miroir : `SLUG_RESERVED` dans
-- `src/features/organizations/organizationSlug.ts`.
do $$
begin
  if exists (select 1 from public.organizations where slug in ('suivi', 'compte', 'notifications')) then
    raise exception 'Un organisme porte déjà le slug « suivi », « compte » ou « notifications » : renommez-le avant de réserver ces mots.';
  end if;
end;
$$;

alter table public.organizations
  drop constraint if exists organizations_slug_url_form;

alter table public.organizations
  add constraint organizations_slug_url_form check (
    slug is null
    or (
      slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      and length(slug) >= 4
      and slug not in ('demarches', 'accueil', 'contact', 'mentions-legales', 'accessibilite',
                       'assistant', 'courrier', 'suivi', 'compte', 'notifications')
    )
  );
