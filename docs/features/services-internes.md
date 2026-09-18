# Services internes (`is_internal_service`) — instruire sans apparaître

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

Une collectivité découpe son organigramme plus finement que ce qu'elle montre à ses usagers.
« État civil », « Direction du Cabinet » instruisent des demandes, mais un usager du portail n'a
pas à choisir entre eux : il s'adresse à **sa mairie**. Le commutateur **« Service interne »**
(colonne `organizations.is_internal_service`, sous-organisations uniquement) retire l'organisme du
**site de démarches** ; c'est son **porteur** — le premier ancêtre (elle comprise) qui n'est pas un
service interne — qui est nommé à sa place, **même s'il n'a pas activé la démarche lui-même**.

- ⚠️ **Une racine n'est jamais un service interne** : elle n'a personne au-dessus d'elle pour la
  porter. Le trigger `enforce_internal_service_not_root` la **corrige** à `false` au lieu de
  refuser (motif `enforce_branding_root_no_inherit`) — promouvoir un service en racine est une
  réorganisation légitime. C'est l'invariant qui garantit que **tout service interne a un
  porteur**, donc que la remontée se termine.
- ⚠️ Le réglage **gouverne l'usage, pas la donnée** (motif `email_sender_name`,
  `branding_inherit_parent`) : le décocher rend l'organisme au portail sans que rien n'ait été
  perdu ; les activations restent en place.
- ⚠️ **UNE DÉMARCHE, UN SEUL INSTRUCTEUR PAR PORTEUR** — le porteur lui-même compris. Deux services
  internes de la même mairie ne peuvent pas activer la même démarche, ni un service et sa mairie :
  une demande déposée au nom de la mairie n'aurait pas de destinataire déterminé. La règle est
  écrite **une seule fois** en base (`internal_service_offer_conflicts`) et appliquée par **deux
  triggers AFTER** — l'un à l'activation (`organization_procedures`), l'autre quand on coche la
  case ou qu'on déplace un service (`organizations`) : le conflit peut naître sans qu'aucune
  activation ne bouge. Détail : [docs/data-model.md](../data-model.md).
- ⚠️ **Le statut n'entre pas dans la règle d'unicité** (cohérence du paramétrage, pas affichage) —
  mais il entre dans le **catalogue** : une activation ne compte que si l'organisation **et son
  porteur** sont actifs. Un service interne sous une mairie obsolète n'est proposé par personne ;
  le faire remonter d'un cran de plus le rattacherait à une agglomération qui ne l'instruit pas.
- **UI** : commutateur dans l'onglet « Informations de base » (`OrganizationInfoTab`, rendu
  seulement si `parent_id !== null`) et dans l'`OrganizationFormDialog` du superadmin (rendu
  seulement si un parent est choisi) ; **badge « Service interne »** en lecture dans
  `OrganizationTree`, à côté d'« Obsolète » — l'organigramme est ce qu'on lit là.
  ⚠️ L'aperçu du porteur se résout **depuis le PARENT**, jamais depuis l'organisation elle-même :
  tant que la case n'est pas enregistrée elle est encore son propre porteur, et l'écran
  annoncerait son propre nom (même piège que `parent_branding`).
- **Onglet « Démarches »** : les démarches déjà portées ailleurs dans le groupe ont leur
  interrupteur **désactivé**, avec la mention « Déjà activée par « Urbanisme » ».
  ⚠️ **Confort, pas garantie** (motif `document_types`) : un administrateur qui n'a pas le droit de
  lire le service frère ne verra rien de désactivé et recevra le message du trigger, déjà en
  français, par le bandeau d'erreur existant. La base reste la seule barrière.
  ⚠️ Une démarche activée **ici** n'est jamais verrouillée : il faut pouvoir la relâcher.
- **En aval** (contrat 1.16.0) : `PortalOrganizationRef` porte `handling_organization_id` — l'UUID
  du service qui instruit, `null` quand le porteur instruit lui-même. ⚠️ **Le NOM du service ne
  sort pas** : la collectivité a choisi de ne pas le montrer. L'identifiant sert à router (Nora
  dépose dans Iris), pas à afficher. `is_internal_service` est aussi exposé sur `OrganizationDto` —
  contrairement aux colonnes de charte, la valeur brute ne ment pas, il n'y a pas d'héritage à
  résoudre.
- **En aval (contrat 1.22.0)** : `PortalOrganizationRef` porte aussi `slug` — l'identifiant lisible
  du **porteur**, qui donne à cet organisme une ADRESSE sur le site de démarches (`/<slug>` y sert
  ses démarches, à ses couleurs et avec son logo). Même règle que `name` : le slug d'un service
  interne ne sort pas. ⚠️ `organizations.slug` a donc changé de statut — il était un confort
  d'administration (point de départ du label DNS), il est devenu **public** : d'où la contrainte
  `organizations_slug_url_form` (4 caractères au moins, `[a-z0-9-]`, mots réservés du portail
  exclus). La longueur minimale n'est pas cosmétique : Nora décide sur la seule forme du premier
  segment d'une adresse s'il lit une langue (`/en`) ou un organisme, sans rien demander au serveur.
- **Qui a une page** se déduit du catalogue, sans réglage : un organisme est atteignable tant qu'il
  propose au moins une démarche publiée. La racine est écartée par Nora — son site est déjà à la
  racine du domaine.
- **En aval (contrat 1.23.0)** : `PortalOrganizationRef` porte aussi `logo_url` — de quoi
  reconnaître l'organisme dans une liste (Nora en fait un menu « Ma ville »). ⚠️ **Logo PROPRE,
  héritage non résolu**, seul endroit du contrat où une valeur de charte sort brute : dans une
  liste de communes, le logo hérité donnerait la même image à chaque ligne. `null` = pas de logo à
  elle, le consommateur met un repli neutre.
- Code : `bearerByOrganization` dans `src/features/superadmin/organizations/orgTree.ts` (pur,
  testé), `bearerGroupSiblings` / `offersHeldBySiblings` dans
  `src/features/organizations/organizationProcedures.ts` (purs, testés),
  `OrganizationProceduresTab.test.tsx`. Miroir edge : `bearerByOrganization` dans
  `public-api/_shared/portalCatalogue.ts` (une edge function n'importe rien de `src/` — testé des
  deux côtés, motif `readDocumentIds`). Migration `organizations_service_interne`.
