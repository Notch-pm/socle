# SOCLE — Architecture UI (Spec produit)

> **Statut** : Spec structurelle — aucun code, aucune refonte visuelle.
> **Référence** : structure fonctionnelle de navigation de *Clara* (Notch), telle
> que documentée dans le design system `Ariane Design System` (projet Claude
> Design, `ui_kits/clara/`). Aucun code, asset ou copy propriétaire n'est repris
> — seule la **logique de navigation et les patterns d'interaction** sont
> reproduits, avec la terminologie et les entités propres à SOCLE.
> **Modèle de données de référence** : voir `DATA_MODEL.md`.
> **Dernière mise à jour** : 2026-07-04

---

## 0. Cadrage

Clara est un SaaS multi-tenant (Notch) pour la gestion de courrier administratif,
construit sur un shell commun avec son produit-frère Ariane : rail latéral
icône-seule, header sticky à slots, panneau de détail (Sheet) pour les entités
riches, tables cliquables, cartes KPI, empty-states à phrase unique. Ce shell
est explicitly conçu par ses auteurs comme mutualisable (« ~80 % du code
visuel est mutualisable » — `MUTUALISATION.md`), ce qui en fait une base saine
à reproduire structurellement pour un autre produit métier.

**Ce qui est repris** : structure du rail de navigation (icône seule, item
pinné + reste centré), structure du header (slots gauche / centre / droite),
pattern table + panneau de détail à onglets, pattern liste filtrée + regroupement,
pattern carte KPI cliquable, règles d'empty-state (phrase unique, pas
d'illustration), règles de contenu (vouvoiement, sentence case, glossaire figé).

**Ce qui n'est PAS repris** : aucun asset Notch (SVG, fichiers), aucun nom de
composant/fichier Notch, aucun copy Clara/Ariane. Les icônes sont décrites
fonctionnellement (à redessiner), pas référencées par fichier.

**Mise à jour (2026-07-04)** : sur demande explicite ultérieure, SOCLE reprend
en fait la **palette de couleurs** de Clara/Ariane (vert AA `hsl(153 90% 32%)`,
jaune beurre, rail sombre forêt — voir `src/index.css`), sous le nom de marque
**Edilumen** (logo propre, fourni par l'utilisateur, distinct de celui de
Notch). Le paragraphe ci-dessus reflète la position initiale (avant cette
demande) — gardé pour l'historique du raisonnement, mais la contrainte
« aucune valeur de token de marque reprise » ne s'applique plus depuis.

**Écart structurel assumé** : SOCLE a une hiérarchie d'organisations récursive
(`organizations.parent_id`) qui n'a *aucun équivalent* dans Clara (mono-organisation,
pas de sélecteur) ni dans Ariane (sélecteur de site *plat*, pas récursif). Un
composant **arbre de navigation (TreeView)** est donc nécessaire — voir §5. C'est
la seule brique sans précédent direct dans le kit source ; elle est composée à
partir des mêmes atomes (Surface, Badge, chevrons) pour rester cohérente.

---

## État d'implémentation (mise à jour 2026-07-04)

Ce document a été écrit **avant** l'implémentation, comme spec de navigation.
Depuis, le développement réel a révélé un écart structurel majeur par rapport
à l'hypothèse de départ, documenté en détail dans `ARCHITECTURE.md` §6 :

**Clara sépare complètement l'espace super-admin de l'espace régulier**
(layouts, sidebars et menus distincts, redirection automatique selon
`global_role`) — ce n'était pas visible depuis le design system seul (qui ne
contient pas ces écrans), seule l'exploration du code réel de Clara
(`SuperAdminLayout`, `SuperAdminSidebar`, `SuperAdminRoute`) l'a révélé. Le
§1 ci-dessous ne décrit donc que l'espace **régulier** (admin/consultant
d'une organisation) — voir §7 (nouveau) pour l'espace super-admin.

**Statut réel par écran** (voir détail §3) :

| Écran | Statut |
|---|---|
| Login, Mot de passe oublié, Activation/réinitialisation de mot de passe | ✅ Construit |
| Shell régulier (Header + Sidebar 5 icônes) | ✅ Construit |
| Catégories (ajout/modification/suppression) | ✅ Construit |
| Utilisateurs & rôles (régulier) | ✅ Construit — limitation : pas de sélecteur d'organisation, utilise la première appartenance de l'utilisateur (voir point ouvert §6.1, toujours non résolu) |
| Organisations, Démarches (régulier) | ⏳ Placeholders ("Cet écran arrive prochainement") |
| Espace super-admin (Tableau de bord, Organisations, OrgSettings à 5 sections dont SMTP) | ✅ Construit — voir §7 |

---

## 1. Structure complète des menus

### 1.1 Sidebar (rail latéral)

Reprise exacte du pattern Clara : rail vertical étroit, fond sombre distinct du
fond clair de l'app, icône seule en desktop (tooltip au survol), item
« Tableau de bord » **épinglé en haut** séparément, reste des items **centrés
verticalement** dans l'espace restant du rail. Bascule en barre de navigation
basse (icônes + micro-labels) en mobile.

| Position | Item | Icône (fonctionnelle) | Route |
|---|---|---|---|
| Pinné haut | Tableau de bord | 4 carrés (dashboard générique) | `/dashboard` |
| Centré | **Organisations** | icône identitaire dédiée (hiérarchie / nœuds reliés) — seul glyphe « custom » du rail, à l'image du traitement que Clara réserve à son item dominant | `/organisations` |
| Centré | Démarches | liste à puces / check | `/demarches` |
| Centré | Catégories | tag / dossier | `/categories` |
| Centré | Utilisateurs & rôles | silhouettes (users) | `/utilisateurs` |

**Non présents dans le rail** (choix délibéré, justifié §0/§2) :
- *Sous-organisations* : pas un item de premier niveau — c'est une vue imbriquée
  de la même entité `organizations` (hiérarchie), pas une table distincte.
- *Paramètres globaux* : dans Clara/Ariane, « Paramètres » vit dans le **header**,
  jamais dans le rail. Reproduit à l'identique (voir 1.2).

### 1.2 Topbar (header)

Reprise du pattern « header à slots » documenté dans `MUTUALISATION.md`
(gauche fixe / centre optionnel / droite actions), 56px sticky.

```
[Logo SOCLE] | [Nom organisation courante]     [Sélecteur d'organisation ▾]     [🔔] [⚙ Paramètres] [Avatar ▾]
   ← gauche →                                        ← centre (slot) →              ← droite (actions) →
```

- **Gauche** : logo produit + séparateur + nom de l'organisation active (fallback
  texte si pas de logo tenant) — identique structurellement aux deux produits sources.
- **Centre (slot)** : **sélecteur d'organisation** — chip/pill « nom + chevron »
  ouvrant un popover (recherche + liste des organisations accessibles à
  l'utilisateur). Repris du slot occupé par le *site selector* d'Ariane
  (Clara laisse ce slot vide, faute de multi-tenant hiérarchique) — adapté ici
  à la hiérarchie SOCLE. Comportement exact soumis à décision, cf. §6.
- **Droite (actions)** :
  - Bouton notifications (cloche + badge non-lus + popover liste) — pattern
    `NotificationBell` de Clara, structure identique.
  - Bouton **Paramètres globaux** (icône réglages) — remplace la position
    « Paramètres » commune aux deux headers sources.
  - Menu utilisateur (avatar + chevron) → popover : nom + rôle global, séparateur,
    « Mon profil », séparateur, « Déconnexion » (variante destructive) — identique
    au pattern des deux apps sources.

---

## 2. Arborescence navigationnelle

```
(public, hors shell authentifié — routes réelles, différentes du nommage initial de ce document)
├── /login
├── /mot-de-passe-oublie                      Demande de lien de réinitialisation
├── /activer-compte                            Saisie du mot de passe (invitation)
└── /reinitialiser-mot-de-passe                Saisie du mot de passe (réinitialisation)
    (même composant que /activer-compte, copie adaptée selon le contexte détecté)

/ (App Shell authentifié : Header + Sidebar + zone de contenu)
├── /dashboard                                Tableau de bord [pinné]
│
├── /organisations                            Organisations (vue arbre)
│   ├── /organisations/new                    Création d'organisation
│   └── /organisations/:id                    Détail organisation (panneau à onglets)
│       ├── Onglet Informations générales
│       ├── Onglet Sous-organisations         (liste des enfants directs + création)
│       ├── Onglet Démarches activées         (organization_procedures : is_enabled, custom_name, custom_order)
│       ├── Onglet Utilisateurs rattachés     (user_organizations scopé à cette organisation)
│       └── Onglet Paramètres de l'organisation (metadata)
│
├── /demarches                                Démarches (liste + filtres)
│   ├── /demarches/new                        Création de démarche
│   └── /demarches/:id                        Détail démarche (panneau/page à onglets)
│       ├── Onglet Contenu                    (traductions, description agent / description utilisateur, mots-clés, catégorie, ordre)
│       ├── Onglet Organisations               (quelles organisations l'activent / personnalisent — vue miroir de organization_procedures)
│       └── Onglet Statut                      (is_active_global — killswitch)
│
├── /categories                               Catégories (liste)
│   └── /categories/:id                       Édition catégorie (modale ou panneau léger)
│
├── /utilisateurs                             Utilisateurs & rôles (liste)
│   ├── /utilisateurs/invite                  Invitation utilisateur
│   └── /utilisateurs/:id                     Détail utilisateur (panneau)
│       ├── Rôle global (global_role)
│       └── Rattachements par organisation (role local, table user_organizations)
│
└── (déclenché depuis le header, pas le rail)
    /parametres                               Paramètres globaux
    ├── Général
    ├── Sécurité
    └── Mon profil
```

**Profondeur de navigation** : jamais plus de 2 niveaux visibles simultanément
(liste → panneau de détail à onglets). Identique à la profondeur maximale
observée dans Clara (`BoiteAuxLettres` → `MailboxSidePanel` à sections). Aucune
page de détail n'ouvre un niveau 3 en plein écran — tout niveau 3 reste un
onglet du panneau de niveau 2.

---

## 3. Écrans nécessaires (liste exhaustive)

### Authentification / système
```
Login ✅ · ForgotPassword ✅ · SetPassword ✅ (activation + réinitialisation, même composant)
```

### Cœur applicatif (espace régulier)

| # | Écran | Pattern repris de Clara | Contenu | Statut |
|---|---|---|---|---|
| 1 | Dashboard | 4 KpiCard cliquables + liste « derniers éléments » | KPIs : organisations actives, démarches actives, utilisateurs, catégories (à affiner métier) | ⏳ Placeholder vide |
| 2 | OrganisationsTree | *nouveau — cf. §0* | Arbre expansible/collapsible des organisations, sélection → ouvre le panneau détail | ⏳ Placeholder — géré côté super-admin uniquement pour l'instant (§7) |
| 3 | OrganisationDetail | Side panel à sections (`MailboxSidePanel`) | 5 onglets (voir §2) | ⏳ Idem — voir OrgSettings §7 |
| 4 | OrganisationCreateEdit | Form modal/panneau | name, slug, type, parent, metadata | ⏳ Idem |
| 5 | DemarchesList | Table + FilterBar + regroupement (`Instruction.jsx`) | Recherche, filtre catégorie, filtre organisation (si super_admin), filtre statut, regroupement par catégorie | ⏳ Placeholder vide |
| 6 | DemarcheDetail | Side panel à onglets | Contenu / Organisations / Statut (voir §2) | ⏳ Placeholder |
| 7 | DemarcheCreateEdit | Form | name, category_id, translations, keywords, agent_description, user_description | ⏳ Placeholder |
| 8 | CategoriesList | Table simple | name, icon, nombre de démarches rattachées | ✅ Construit |
| 9 | CategorieCreateEdit | Form modal léger | name, icon (picker, 20 icônes curées) | ✅ Construit |
| 10 | UtilisateursList | Table + recherche | Nom, email, rôle (admin/consultant), actions | ✅ Construit — organisation résolue via la première appartenance (pas de sélecteur, voir §6.1) |
| 11 | UtilisateurDetail | — | Remplacé par une modale d'édition (prénom/nom/rôle), pas un panneau séparé | ✅ Construit (forme simplifiée) |
| 12 | UtilisateurInvite | Form + Edge Function `invite-user` | email, first_name, last_name, rôle local — envoie un email d'invitation via `smtp_settings` de l'organisation | ✅ Construit |
| 13 | ParametresGlobaux — Général | Page à sections | Paramètres plateforme | ⏳ Non commencé |
| 14 | ParametresGlobaux — Sécurité | Page à sections | Politique de sécurité (portée à définir) | ⏳ Non commencé |
| 15 | MonProfil | Page simple | Infos du compte connecté | ⏳ Non commencé (le menu utilisateur n'a pas d'entrée "Mon profil" pour l'instant, seulement Déconnexion) |

Total : **3 écrans d'authentification + 15 écrans/panneaux applicatifs = 18** (dont 6 construits, 9 en attente, 1 construit sous forme simplifiée). Voir §7 pour les écrans super-admin, absents de ce compte initial.

---

## 4. États (loading / empty / error)

Reprise stricte des règles de contenu Clara/Ariane : **une phrase, pas
d'illustration** (sauf écran déjà vide de tout autre contenu), ton vouvoiement,
sentence case.

| Écran / famille | Loading | Empty | Error |
|---|---|---|---|
| Dashboard | Skeleton sur les 4 KpiCard (valeur numérique masquée) + skeleton liste | — (le dashboard n'est jamais vide : 0 est une valeur valide) | Bandeau « Impossible de charger le tableau de bord. » + action Réessayer |
| OrganisationsTree | Skeleton de nœuds (3–4 lignes indentées) | « Aucune organisation à afficher. » | « Impossible de charger les organisations. » + Réessayer |
| OrganisationDetail | Skeleton des lignes meta + onglets désactivés | Par onglet : « Aucune sous-organisation. » / « Aucune démarche activée. » / « Aucun utilisateur rattaché. » | « Impossible de charger cette organisation. » |
| DemarchesList | Skeleton table (lignes grises) | « Aucune démarche ne correspond à ces filtres. » (si filtres actifs) / « Aucune démarche configurée. » (sinon) | « Impossible de charger les démarches. » + Réessayer |
| DemarcheDetail | Skeleton des champs | Onglet Organisations : « Cette démarche n'est activée dans aucune organisation. » | « Impossible de charger cette démarche. » |
| CategoriesList | Skeleton table | « Aucune catégorie configurée. » | « Impossible de charger les catégories. » |
| UtilisateursList | Skeleton table | « Aucun utilisateur ne correspond à ces filtres. » | « Impossible de charger les utilisateurs. » |
| UtilisateurDetail | Skeleton | « Cet utilisateur n'est rattaché à aucune organisation. » | « Impossible de charger cet utilisateur. » |
| Formulaires (création/édition, tous écrans) | Bouton de soumission en état chargement (spinner inline) | n/a | Message d'erreur par champ (inline) + toast destructif si échec serveur |
| Login | Bouton en état chargement | n/a | « Email ou mot de passe incorrect. » (reprise verbatim du pattern commun aux deux apps sources — formulation générique, non spécifique à un produit) |
| Sélecteur d'organisation (header) | Skeleton dans le popover | « Aucune organisation accessible. » | Popover fermé + toast d'erreur |

---

## 5. Design system réutilisable (components list)

Organisé selon la même logique de catégorisation que le design system source
(fondations → primitives → composants de layout → composants de données →
feedback), en renommant tout élément spécifique à la marque Clara/Ariane.

### 5.1 Fondations (tokens — structure, pas valeurs de marque)
- Palette sémantique (background / foreground / primary / secondary / muted /
  destructive / success / warning / border) — **valeurs propres à SOCLE**, structure
  de nommage reprise.
- Palette dédiée au rail de navigation (fond sombre distinct du fond de page).
- Échelle de rayons (1 valeur de rayon de carte, pills en `rounded-full` pour
  badges/chips).
- Échelle d'élévation (4 paliers : sm/md/lg/xl, lift au hover).
- Typographie : une seule famille, poids 400/500/600/700 (à choisir pour SOCLE),
  sentence case partout, pas de tout-capitales.

### 5.2 Primitives atomiques
```
Btn (variants: primary/outline/ghost/destructive, tailles sm/md/lg)
Input · SearchInput · Field (label + hint + error) · Select
Badge (variants: outline/secondary/muted + option "dot" pour statut)
Avatar (initiales)
Surface (conteneur carte de base)
StatusDot (couleur par catégorie d'état métier)
Icon (jeu d'icônes générique, style unique cohérent)
```

### 5.3 Composants de layout
```
AppShell        — assemble Header + Sidebar + zone de contenu, gère la route active
Header           — slots gauche/centre/droite (voir §1.2)
SidebarRail       — rail icône-seule, item pinné + reste centré, tooltips
MobileNav         — bascule bottom-bar du rail en mobile
OrgSwitcher       — *nouveau*, popover de sélection d'organisation dans le slot centre
```

### 5.4 Composants de données
```
KpiCard           — carte cliquable, label + valeur + icône (pattern dashboard 4-up)
DataTable         — table avec ligne cliquable (hover + état sélectionné)
FilterBar         — recherche + selects de filtre + regroupement, alignés en barre
GroupedList       — regroupement collapsible avec compteur (Badge)
DetailPanel       — panneau latéral (Sheet) à sections/onglets, pattern du side panel riche
EmptyState        — bloc centré, une phrase, pas d'illustration
TreeView          — *nouveau, cf. §0* : nœuds indentés, expand/collapse, sélection → DetailPanel
```

### 5.5 Feedback
```
Toast / notification ponctuelle (variante neutre / destructive)
Alert (bandeau inline, variantes info/warning/destructive)
Skeleton (texte, ligne de table, carte)
NotificationsPopover (liste + badge non-lus + "tout marquer comme lu")
```

---

## 6. Points ouverts (à trancher — liés à `DATA_MODEL.md`)

1. **Comportement du sélecteur d'organisation** vis-à-vis de la hiérarchie
   (`organizations.parent_id`) : montre-t-il uniquement les organisations où
   l'utilisateur a un rattachement direct (`user_organizations`), ou tout le
   sous-arbre si l'utilisateur est admin d'un parent ? Directement lié au point
   **C** de `DATA_MODEL.md` (propagation des droits dans la hiérarchie).
   **Toujours ouvert** (2026-07-04) : ce sélecteur n'existe pas encore dans le
   shell régulier ; l'écran Utilisateurs & rôles contourne le problème en
   utilisant la première organisation de l'utilisateur (`useMyOrganizationId`),
   ce qui n'est correct que pour un utilisateur mono-organisation.
2. **Contenu de l'onglet « Démarches activées »** d'une organisation : doit-il
   lister uniquement les démarches dont `procedures.organization_id` correspond
   à un ancêtre (modèle template), ou toute démarche existante quelle que soit
   son organisation propriétaire ? Lié au point **A** de `DATA_MODEL.md`,
   désormais confirmé par l'implémentation (voir `ARCHITECTURE.md` §0.3).
   **Toujours ouvert** : la section « Démarches activées » de `OrgSettings`
   (§7) reste un placeholder tant que le catalogue `procedures` n'a pas
   d'écran de gestion propre.
3. **Portée du filtre "organisation" dans DemarchesList/UtilisateursList** :
   visible uniquement pour `global_role = super_admin`, ou aussi pour un
   `admin` local avec plusieurs rattachements ? Sans objet pour l'instant côté
   régulier (pas de filtre implémenté), pertinent côté super-admin (§7) où
   `OrganizationsAdminPage` liste déjà toutes les organisations sans filtre.
4. **Contenu réel de « Paramètres globaux »** (Général/Sécurité) — la liste de
   champs n'est pas dérivée du modèle de données actuel (aucune table dédiée) ;
   à cadrer avec le métier avant de détailler les écrans. **Non commencé.**
5. **(Nouveau, 2026-07-04) Séparation Categories/Users entre espace régulier
   et super-admin** : `UsersManagementPage` est déjà réutilisée dans les deux
   contextes (comme `UsersPage` chez Clara), paramétrée par `organizationId`.
   `CategoriesPage` ne l'est *pas* — elle n'existe que côté régulier, avec son
   propre sélecteur d'organisation inline dans le formulaire de création. Faut-il
   la rendre réutilisable de la même façon côté super-admin (dans `OrgSettings`) ?
   Pas encore tranché.

---

## 7. Espace super-admin (ajouté 2026-07-04 — absent de la spec initiale)

Découvert en explorant le code réel de Clara (`SuperAdminLayout`,
`SuperAdminSidebar`, `SuperAdminDashboard`, `OrganizationsAdmin`, `OrgSettings`)
après une demande explicite de réplication « comme dans Clara ». Contrairement
au reste de ce document, cette zone n'était pas anticipée par la spec initiale
— voir `ARCHITECTURE.md` §6 pour la justification architecturale complète
(redirection automatique, séparation stricte des deux espaces).

### 7.1 Menu (sidebar étiquetée, pas un rail icône-seule)

Contrairement au rail icône-seule de l'espace régulier (§1.1), le menu
super-admin est une sidebar **étiquetée** (icône + texte), largeur fixe, non
collapsible dans notre implémentation (Clara la rend collapsible via le
composant `Sidebar` de shadcn — simplifié ici) :

| Item | Icône | Route |
|---|---|---|
| Tableau de bord | `LayoutDashboard` | `/superadmin` |
| Organisations | `Building2` | `/superadmin/organisations` |

Pied de sidebar : email + rôle de l'utilisateur connecté, bouton Déconnexion.
Pas de « Démarches », « Catégories » ni « Utilisateurs & rôles » au niveau
racine — ces éléments sont tous rattachés à une organisation précise, donc
accessibles uniquement via le détail d'une organisation (§7.3).

### 7.2 Écrans

| Écran | Contenu | Statut |
|---|---|---|
| SuperAdminDashboardPage | 2 KpiCard (nombre d'organisations, nombre d'utilisateurs) | ✅ Construit |
| OrganizationsAdminPage | Table (nom, organisation parente, type, actions), création/édition/suppression | ✅ Construit — table plate + colonne parent, pas un TreeView (voir §5.4, toujours pas implémenté) |
| OrgSettingsPage | Grille de cartes → section inline avec retour, pattern identique à `OrgSettings.tsx` de Clara | ✅ Construit, 5 sections : |
| — Informations générales | Formulaire nom/slug/type/organisation parente | ✅ Construit |
| — Sous-organisations | Liste des enfants directs + création (parent pré-rempli) | ✅ Construit |
| — Utilisateurs | Réutilise `UsersManagementPage` (ajout/modification/suppression + invitation par email) | ✅ Construit |
| — Démarches activées | — | ⏳ Placeholder (dépend du catalogue `procedures`, non construit) |
| — Emails (SMTP) | Formulaire SMTP par organisation + bouton d'envoi de test | ✅ Construit (2026-07-04) |

### 7.3 Sécurité

Chaque action de cette zone est protégée à deux niveaux : la route elle-même
(`SuperAdminRoute`, redirige tout non-super-admin) et RLS (`is_super_admin()`
pour l'écriture sur `organizations`/`smtp_settings`, `is_org_admin()` — qui
inclut `is_super_admin()` — pour la lecture/écriture des membres). Voir
`ARCHITECTURE.md` §5 pour le détail des policies.

---

## Journal des décisions

| Date | Point traité | Décision | Justification |
|---|---|---|---|
| 2026-07-04 | Espace super-admin | Ajouté comme zone complètement séparée (§7), absente de la spec initiale | Découverte du code réel de Clara ; demande explicite « les menus sont différents » |
| 2026-07-04 | Routes d'authentification | Renommées `/mot-de-passe-oublie`, `/activer-compte`, `/reinitialiser-mot-de-passe` (au lieu de `/reset-password`/`/activate-account` prévus initialement) | Cohérence avec le reste des routes de l'app (déjà en français) |
| 2026-07-04 | `ActivateAccount` et `ResetPassword` | Fusionnés en un seul composant `SetPasswordPage`, copie conditionnelle selon le contexte détecté | Évite la duplication que Clara a elle-même (deux fichiers quasi identiques) |
| 2026-07-04 | Catégories, Utilisateurs & rôles (régulier), écrans d'authentification | Construits — voir tableau d'état en tête de document | Développement effectif de ce tour |
| 2026-07-04 | Organisations, Démarches (régulier), Paramètres globaux, Mon profil | Restent des placeholders ou non commencés | Hors périmètre des demandes traitées jusqu'ici |
