-- Le slug d'une organisation devient une ADRESSE PUBLIQUE.
--
-- Jusqu'ici il ne servait qu'en interne : fabriquer un label DNS au moment de
-- provisionner une collectivité (`dns_label_from_slug`). Le portail usagers
-- s'en sert désormais comme chemin — `laurentville.edilumen.fr/mairie-d-arles`
-- ouvre la page de cet organisme, avec ses démarches, ses couleurs et son logo.
-- Ce qui était un confort d'administration devient donc une adresse qu'une
-- mairie imprime sur ses affiches : elle doit être stable, et lisible.
--
-- ⚠️ POURQUOI QUATRE CARACTÈRES AU MINIMUM — c'est la règle qui porte tout le
-- reste. Le portail lit le premier segment d'une adresse SANS rien demander au
-- serveur : un segment de deux ou trois lettres est un code de langue (`/en`,
-- `/gsw`, motif `^[a-z]{2,3}(-[a-z0-9]{2,8})*$`), tout le reste est un
-- organisme. C'est ce qui lui permet de savoir quel écran afficher avant même
-- d'avoir répondu. Un slug de trois caractères serait donc lu comme une langue,
-- et la page de cet organisme deviendrait inatteignable — sans message, sans
-- erreur, avec l'accueil à la place. La règle se lit des deux côtés :
-- `LANG_SEGMENT_RE`, dans `Nora/src/i18n/localizedPath.ts`.
--
-- ⚠️ LES MOTS RÉSERVÉS sont les segments de route du portail : `demarches` (une
-- démarche et son formulaire) et les pages que la roadmap prévoit de composer
-- au niveau de la collectivité — « Contact », « Mentions légales »,
-- « Accessibilité ». Les interdire aujourd'hui coûte une ligne ; les récupérer
-- plus tard demanderait de renommer l'adresse d'un organisme déjà communiquée.
--
-- Aucune ligne existante ne casse : les organisations de la base ont toutes un
-- slug conforme, vérifié avant d'écrire cette migration.

alter table public.organizations
  drop constraint if exists organizations_slug_url_form;

alter table public.organizations
  add constraint organizations_slug_url_form check (
    slug is null
    or (
      slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      and length(slug) >= 4
      and slug not in ('demarches', 'accueil', 'contact', 'mentions-legales', 'accessibilite')
    )
  );

comment on column public.organizations.slug is
  'Identifiant lisible, unique sur la plateforme. Sert d''ADRESSE PUBLIQUE au portail usagers (`/<slug>` ouvre la page de l''organisme : ses démarches, ses couleurs, son logo) et de point de départ au label DNS d''une nouvelle collectivité. Quatre caractères au moins : en dessous, le portail le lirait comme un code de langue.';
