# Feature : annuaire des agents et accès aux applications

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

**Le Socle décide qui a accès à quelle application, sur quel organisme, avec quel rôle de base**
(décision du 2026-10-30, à la demande des DSI). Les droits fins restent dans chaque application
(profils Iris par démarche, signataire / viseur Clara…). Plan d'ensemble en cinq lots :

| Lot | Contenu | État |
|---|---|---|
| 0 | Étude Keycloak (IdP dédié, fédéré aux annuaires des collectivités) et ADR | **fait** (2026-10-30) : 6 scénarios en local, [`labs/sso-keycloak/`](../../labs/sso-keycloak/README.md), ADR dans `architecture.md` |
| 1 | Annuaire et matrice d'accès dans le Socle | **en ligne** (2026-10-30) |
| 2 | `GET /v1/users` (scope `users`), lecture incrémentale | **en ligne** (2026-10-30, contrat 1.43.0) |
| 3 | Consommation par Clara puis Iris (`sync-socle-users`, écrans verrouillés) | **en ligne** (2026-10-30) : Clara (rôle de base + affectations) et Iris (accès seul) ; vérifiés de bout en bout |
| 4 | Connexion OIDC par Keycloak dans chaque application | en cours — `auth.edilumen.fr` en ligne (VPS OVH, France, kit [`infra/keycloak/`](../../infra/keycloak/README.md)), fédération Entra de test vérifiée, inscriptions fermées, branchement du Socle à faire ; état et reprise [plus bas](#lot-4--état-et-reprise-2026-11-10) |

Principe : **Keycloak authentifie, le Socle autorise.** Un agent authentifié mais non provisionné
par le Socle n'entre dans aucune application.

## Modèle (détail : [data-model.md](../data-model.md))

- **Socle** : inchangé, `user_organizations` (`admin` / `consultant`). Ni ses policies ni les
  quatre helpers RLS ne bougent.
- **Autres applications** : `user_application_access (user, application, organisme, rôle,
  is_active)`, rôles déclarés dans `application_roles`. Une application sans rôle déclaré (Nora)
  n'apparaît pas dans la matrice.
- ⚠️ **Retirer = désactiver** (`is_active = false`), jamais supprimer : l'application doit
  apprendre le retrait pour bannir le compte, et le rôle revient gratuitement (motif « le réglage
  gouverne l'usage, pas la donnée »).
- ⚠️ L'accès exige l'**abonnement de la racine** (trigger, vérifié à la pose). Un désabonnement
  ultérieur ne touche pas aux lignes.
- **Statut** `users.status` : `suspended` coupe tous les accès de la gamme d'un geste, lignes
  conservées. RPC `set_user_status` seulement : super admin, ou administrateur dont le périmètre
  couvre **tous** les rattachements de l'agent (un agent partagé entre deux collectivités ne se
  suspend pas depuis l'une d'elles). Elle pose aussi `auth.users.banned_until` : le Socle refuse
  connexion et rafraîchissement ; `ProtectedRoute` affiche « compte suspendu » pendant que le
  jeton en cours expire.
- ⚠️ **Privilèges de colonne sur `users`** : le navigateur n'écrit que `first_name`/`last_name`.
  Ne jamais rendre un `GRANT UPDATE` de table à `authenticated` (il rouvrirait l'écriture de
  `global_role`).

## Écran

`/parametres/utilisateurs` et la section utilisateurs d'`OrgSettingsPage` (même composant) :
matrice agent × application (Socle en tête, puis les applications abonnées par la racine), rôle ou
« — » et le nombre d'organismes ouverts (noms au survol), badge « Suspendu », actions renvoyer
l'invitation (accès Socle seulement), modifier, suspendre / réactiver, retirer (accès Socle
supprimés, accès aux applications désactivés sur l'organisme **et ses services**). Les agents sans
plus aucun accès sont masqués derrière une case à cocher.

**Organismes ouverts** (2026-11-10) : l'écran lit tout le **sous-arbre** de l'organisme de la page
(`useManagedOrganizations`, `managedOrganizations`). Création et modification proposent, par
application, **un rôle** puis un tableau **organismes × applications ouvertes** (cases à cocher,
« Tous / Aucun » par colonne ; l'organisme de la page coché d'office). Logique pure et testée dans
`agentAccess.ts` (`AccessDraft`, `validateDraft`, `planSocleChanges`, `planAccessChanges`).
- **Un rôle par application** (vérifié en base le 2026-11-10 : aucun agent n'en avait deux), mais
  des organismes **propres à chaque application** (5 agents avaient le Socle sur la racine et Clara
  sur des services).
- ⚠️ **L'administration d'une application vaut pour toute la collectivité** (Clara et Iris : un
  administrateur voit tout le tenant). Un rôle `is_admin` exige donc la **racine** ; les services en
  plus restent permis (affectations Clara). L'écran coche et verrouille la racine, ne propose pas ces
  rôles à un administrateur de service, et la base tranche (contrainte différée
  `enforce_application_admin_on_root`, voir data-model). Les 40 accès « Administrateur » Clara posés
  sur des services par la reprise avaient tous leur pendant sur la racine.
- ⚠️ **Un agent relève d'une seule collectivité** (le super admin seul fait exception) :
  `invite-user` refuse (409) un compte déjà rattaché ailleurs, et tous les organismes demandés
  doivent avoir la racine de l'organisme de la page. Aucun agent multi-collectivité en base au
  2026-11-10.

## `invite-user`

- Corps : `role` = rôle Socle **ou vide**, `socle_organization_ids`, `applications: [{ application_id,
  role_code, organization_ids }]` ; listes absentes = l'organisme de la page (`organization_id`, qui
  fixe aussi le relais de l'invitation). Au moins un accès. Périmètre de **chaque** organisme
  (réévalué avec le jeton de l'appelant), même collectivité, abonnement, rôle et règle de la racine
  **vérifiés avant toute écriture** (pas de compte orphelin) — lecture et règles pures dans
  `_shared/accessRequest.ts` (testé).
- Compte existant : 409 s'il a déjà un accès sur l'un des organismes demandés (« modifiez ses
  accès depuis la liste »), ou s'il est rattaché à une **autre collectivité** (sauf super admin).
- Renvoi d'invitation : le compte doit avoir un accès au Socle sur un organisme que l'appelant gère.
- L'invitation par courriel ne part que si l'agent a un **accès au Socle** (elle sert à choisir
  le mot de passe du Socle). Tant que la connexion unique (lot 4) n'est pas en place, chaque
  application invite ses agents.
- Recherche du compte existant dans `public.users` par e-mail (plus `listUsers`, borné à 1 000).

## `GET /v1/users` (public-api, contrat 1.43.0)

- Gardes : scope `users` (403), clé **rattachée à une application** (403), `tenant_id` dans le
  périmètre (404). Ne sert que les accès de l'application de la clé (`api_keys.consumer`) : une
  application ne voit jamais ceux d'une autre. Une clé Iris ou Clara existante doit **gagner le
  scope `users`** (nouvelle clé ou ajout du scope) avant que l'application consomme.
- Réponse `{ agents, as_of }` : un agent = son état **complet** (tous ses accès sur le
  sous-arbre), `is_active` résumé (statut actif ET un accès actif). Sérialisation en liste
  blanche, pure : `_shared/agents.ts` (`agents.test.ts`).
- ⚠️ **Pas de webhook** (écart avec le plan initial, décidé en lot 2) : la base n'a pas `pg_net`,
  et un signal exigerait un secret par application. L'application lit **par incréments**
  (`updated_since` = `as_of` précédent, pris 5 s dans le passé), par exemple chaque minute.
- ⚠️ La lecture incrémentale ne voit que ce qui **change** : un accès ne se supprime donc jamais
  (policy DELETE retirée, privilège révoqué — migration `api_users_scope`). Restent les cascades
  (organisme ou compte supprimé), rattrapées par la réconciliation complète de la nuit.

## Reprise des comptes Clara (2026-10-30)

Faite une fois, en SQL, sur les 6 tenants Clara rattachés au Socle (données de démonstration) :
29 appartenances Clara → 29 agents du Socle (22 comptes créés **sans mot de passe ni accès
Socle**, donc sans courriel ; 7 existaient) et 107 accès Clara. Règles :
- un accès par organisme où l'agent était affecté dans Clara, avec son rôle de tenant ; sans
  affectation (ou affecté à un organisme qui n'existe plus au Socle — 2 services `[TEST]`) :
  un accès sur la collectivité ;
- rôle hérité `member` → `gestionnaire` ; appartenance inactive → accès `is_active = false` ;
- côté Clara, `users.socle_user_id` posé par e-mail (29/29).

Conséquence acceptée : un agent non administrateur **sans** affectation dans Clara reçoit une
affectation sur la racine quand Clara la tient en miroir (il voit aussi les courriers adressés à
la collectivité) ; les affectations aux deux services `[TEST]` disparus sont retirées.

## Lot 0 : ce que le lab a établi (2026-10-30)

Keycloak + Supabase Auth local ([`labs/sso-keycloak/`](../../labs/sso-keycloak/README.md)) :
- ✅ un agent pré-créé par la sync (sans mot de passe, non confirmé) se connecte par l'annuaire de
  sa collectivité et retombe sur **le même compte** (même `id`) — pas de pont maison ;
- ✅ inscriptions fermées : un agent authentifié mais **non provisionné** est refusé (422) ;
- ✅ un compte **banni** (suspension) est refusé même avec une session Keycloak ouverte ;
- ✅ connexion unique entre applications, découverte de l'annuaire par `kc_idp_hint` ;
- ⚠️ **`scopes: 'openid'`** obligatoire dans `signInWithOAuth` (sinon 403 sur `userinfo`) ;
- ⚠️ Keycloak doit avoir **une seule adresse publique**, vue à l'identique par les navigateurs et
  par Supabase Auth (émetteur des jetons).

Hébergement de production (choisi le 2026-11-06) : un **VPS OVH en France** (VPS-1, Caddy +
Keycloak + Postgres en Docker, `https://auth.edilumen.fr`), console d'administration fermée au
public — installation, sauvegardes et branchement d'un annuaire Entra ID dans
[`infra/keycloak/`](../../infra/keycloak/README.md). Fédération avec un **vrai Entra ID** vérifiée le
2026-11-06 (annuaire de test, fournisseur `entra-test`) : e-mail, prénom et nom transmis, e-mail
tenu pour vérifié. Reste pour le lot 4 : l'écran du Socle qui associe un domaine d'e-mail à l'annuaire d'une
collectivité, et le bouton de connexion dans chaque application.

## Lot 4 : état et reprise (2026-11-10)

> **Reprise — à lire en premier (fin de session du 2026-11-10).**
> - **En production** : annuaire multi-organismes (Notch-pm/socle#1, migration
>   `admin_application_racine`, `invite-user` v21 = code de `main`) ; profil système
>   « Administrateur » d'Iris (Notch-pm/Iris#1, migration `profil_administrateur_socle`,
>   `sync-socle-users` Iris v2) ; inscriptions Supabase fermées sur Socle, Iris, Clara ; URL de
>   retour autorisées (`socle…/login`, `iris…/login`, `clara…/connexion`).
> - **Prêt, NON mergé, NON déployé** — une branche `feature/sso-lot4` par dépôt :
>   Socle (bouton Keycloak, message de bienvenue unique dans `invite-user`, mot de passe derrière
>   « Autre méthode », cette fiche), Iris et Clara (même bouton, `sync-socle-users` sans e-mail).
>   ⚠️ Ne pas merger avant l'essai réel : sinon les agents ne reçoivent plus de lien pour un mot de
>   passe et Keycloak n'est pas encore branché.
> - **Prochaine étape, sur le poste habituel (tunnel SSH)** : déployer le thème de connexion
>   (`infra/keycloak/themes/edilumen/`, README Keycloak § 9) ; console Keycloak, realm `edilumen` —
>   secrets des clients `socle` / `clara` / `iris`, SMTP du realm, inscription + vérification
>   d'e-mail + mot de passe oublié, thèmes `edilumen` (connexion et e-mails), « Organisations » pour le domaine Entra de test ; puis providers
>   `keycloak` des trois Supabase ; puis l'essai (check-list ci-dessous). Ensuite seulement :
>   merge des trois branches, déploiement de `invite-user` (Socle) et des deux
>   `sync-socle-users` (Clara, Iris).
> - Méthode : le but d'abord, une action à la fois (voir la fin de cette section).


Fait :
- Serveur `auth.edilumen.fr` **en ligne** depuis le 2026-11-06 (VPS OVH, utilisateur `debian`,
  connexion SSH par clé seulement, mots de passe SSH désactivés). Secrets **sur le serveur
  seulement** (`/opt/keycloak/.env`). Sauvegarde par cron à 03:30. Admin du realm master
  nominatif, avec OTP ; le compte d'amorçage est supprimé. Console accessible par tunnel SSH
  seulement (`127.0.0.1:8080`).
- ⚠️ Realm master : `frontendUrl = http://localhost:8080`, sinon la console affiche « Something
  went wrong » (elle vérifie la session sur l'adresse publique, qui est bloquée).
- Fédération Entra ID de test (fournisseur `entra-test`) vérifiée. ⚠️ `/account/?kc_idp_hint=`
  **perd** l'indice : tester par le bouton de la page de connexion.
- Routage par domaine d'e-mail validé sur le lab : la fonction « Organisations » de Keycloak
  envoie un domaine vers son annuaire, les autres adresses vers le mot de passe. Le Socle
  n'envoie donc **pas** de `kc_idp_hint`.
- Branche `feature/sso-lot4` (WIP) : `src/features/auth/sso.ts` (+ test) et bouton « Se connecter
  avec le compte de ma collectivité » dans `LoginPage.tsx` (+ test). Pas encore de migration :
  la table `organization_identity_providers` est prévue, pas écrite.

✅ Inscriptions publiques **fermées** sur les trois projets (Socle, Iris, Clara — 2026-11-10). La
sonde du 2026-11-06 les avait trouvées ouvertes sur le Socle.

Suite, dans l'ordre :
1. ✅ (2026-11-10) Rien ne dépend de l'inscription publique : Socle, Clara, Iris et Nora créent
   leurs comptes par l'API admin (`admin.createUser`, `generateLink` invite / recovery) ; aucun
   `signUp` ni `/auth/v1/signup`. ⚠️ À fermer sur **chaque** projet où l'agent se connecte par
   Keycloak (Socle, Clara, Iris) : c'est le Supabase de l'application qui reçoit l'agent.
2. ✅ (2026-11-10) « Allow new users to sign up » fermé sur le Socle, Iris et Clara (geste
   manuel). URL de retour du Socle vérifiées (*Site URL* `https://socle.edilumen.fr`, *Redirect
   URLs* avec `https://socle.edilumen.fr/login`).
3. Brancher Keycloak sur le Supabase du Socle et faire l'essai réel — check-list ci-dessous
   (exige le poste habituel : clé SSH du tunnel).
4. Brancher Clara et Iris : bouton prêt sur la branche `feature/sso-lot4` de chacun (2026-11-10,
   même module `sso.ts`, testé ; retour sur `/connexion` pour Clara, `/login` pour Iris). Reste,
   pour chacun : provider `keycloak` de son Supabase (client `clara` / `iris` et son secret),
   *Redirect URLs* (`https://clara.edilumen.fr/connexion`, `https://iris.edilumen.fr/login`),
   essai, puis merge. ⚠️ Question ouverte : avec la fonction « Organisations »
   de Keycloak, l'association domaine → annuaire vit dans Keycloak ; la table
   `organization_identity_providers` et son écran superadmin ne servent peut-être plus — à
   trancher après l'essai.

### Check-list de l'étape 3 (Socle)

Les clients `socle`, `clara` et `iris` sont déclarés dans l'import du realm
(`infra/keycloak/realms/edilumen-realm.json`), chacun avec l'URL de retour de son Supabase.

1. **Secret du client** — *but : Supabase doit se présenter à Keycloak.* Tunnel SSH
   (`ssh -L 8080:127.0.0.1:8080 debian@auth.edilumen.fr`), console `http://localhost:8080`,
   realm **edilumen** → *Clients* : vérifier que `socle`, `clara`, `iris` existent → `socle` →
   *Credentials* → copier le *Client secret* (jamais dans un chat ni un fichier).
2. **Provider Supabase** — *but : le Supabase du Socle sait envoyer vers Keycloak.* Projet
   `qhrokbkyxgcvkbpmbmna` → *Authentication → Sign In / Providers → Keycloak* : activé,
   *Client ID* `socle`, *Secret* (étape 1), *Realm URL* `https://auth.edilumen.fr/realms/edilumen`.
   L'URL de retour affichée doit être `https://qhrokbkyxgcvkbpmbmna.supabase.co/auth/v1/callback`
   (celle du client `socle`).
3. **Organisations** — *but : un domaine d'e-mail va droit à son annuaire, sans `kc_idp_hint`.*
   Realm **edilumen** → *Realm settings* : « Organizations » activé (pas dans l'import du realm) ;
   *Organizations* → créer l'organisation de test avec le **domaine du compte Entra de test** →
   onglet *Identity providers* → lier `entra-test` à ce domaine, « Redirect when email domain
   matches » activé — comme au lab.
4. **Agent de test** — *but : un agent provisionné retombe sur son compte.* Dans le Socle, créer
   l'agent avec l'adresse du compte Entra de test et un accès Socle.
5. **Essai** — en navigation privée, ouvrir
   `https://qhrokbkyxgcvkbpmbmna.supabase.co/auth/v1/authorize?provider=keycloak&scopes=openid&redirect_to=https%3A%2F%2Fsocle.edilumen.fr%2Flogin`
   (le bouton n'est pas encore en ligne) : Keycloak demande l'e-mail → Microsoft → retour sur le
   Socle, connecté. Vérifier que `auth.identities` porte une identité `keycloak` sur **le même
   `user_id`** que l'agent créé à l'étape 4.
6. **Contre-essai** — un compte Entra **non** provisionné doit être refusé (retour sur `/login`
   avec une erreur d'inscription fermée), et un agent suspendu aussi.

### Bascule vers la connexion unique (décisions du 2026-11-10)

- **Tout le monde passe par Keycloak, d'un coup** (comptes de démo seulement). Plus de mot de
  passe par application : un agent dont la collectivité a relié son annuaire n'en a aucun ; les
  autres créent **un** compte Keycloak à leur première connexion.
- **Inscription ouverte dans Keycloak, e-mail vérifié** — et non une création des comptes
  Keycloak par le Socle : pas de connecteur Socle → Keycloak, et pas de conflit à la première
  connexion entre un compte local pré-créé et le compte Microsoft d'une collectivité reliée.
  ⚠️ Sûr parce que les inscriptions **Supabase** sont fermées : un compte Keycloak sans accès au
  Socle n'ouvre rien, et Supabase ne rattache qu'une adresse **vérifiée**.
- **Un seul e-mail** : le message de bienvenue du Socle (`invite-user`, `_shared/welcome.ts` —
  miroir de `suiteApps.ts`, épinglé), envoyé à tout nouvel agent, Socle ou non, avec le lien de
  chaque application ouverte et la façon de s'y connecter. Plus de lien d'activation, ni au
  Socle, ni dans `sync-socle-users` de Clara et d'Iris (le compte y est toujours créé, sans mot
  de passe).
- **Pages de connexion** (Socle, Clara, Iris) : le bouton Keycloak est l'entrée principale ; le
  mot de passe reste en secours (admin plateforme, panne de Keycloak) derrière « Autre méthode
  de connexion ».
- Pas de reconnexion d'une application à l'autre : la session Keycloak (`auth.edilumen.fr`)
  renvoie l'agent aussitôt connecté. Facultatif, plus tard : lancer ce passage dès l'arrivée
  sur la page de connexion, relier les déconnexions.

**Réglages du realm `edilumen`** (console Keycloak, poste habituel), en plus de la check-list :
- *Realm settings → Email* : l'expéditeur de la plateforme (valeurs `PLATFORM_SMTP_*`) —
  indispensable à la vérification d'e-mail et au mot de passe oublié ;
- *Realm settings → Login* : « User registration », « Verify email », « Forgot password » et
  « Login with email » activés.
- *Realm settings → Themes → Login theme* et *Email theme* = `edilumen` (thème
  `infra/keycloak/themes/edilumen/` : page de connexion et e-mails au cadre de la gamme,
  déployé par `scp` + `docker compose up -d keycloak` — README Keycloak, § 9) et *HTML display
  name* = « Une seule connexion pour toutes vos applications ».

**Ordre de bascule** : essai réel sur le Socle (check-list) → réglages du realm ci-dessus →
providers `keycloak` de Clara et d'Iris → merge des trois branches `feature/sso-lot4` et
déploiement de `invite-user` (Socle) et `sync-socle-users` (Clara, Iris) dans la foulée.

Restent aussi côté serveur : le SMTP du realm, une sonde externe, une copie des sauvegardes
hors du serveur. Plus tard : Ariane (lot 5), SCIM.

⚠️ Méthode : pour une manipulation dans la console Keycloak ou Azure, expliquer **le but** avant
les étapes, puis donner une action à la fois.

## Iris : le rôle « Administrateur » (2026-11-10)

Complète la décision ci-dessous : Iris déclare un second rôle de base, `administrateur`
(is_admin), qui donne **dans Iris** le **profil système** « Administrateur » de la collectivité
(administration + tous droits sur toutes les démarches) — un profil verrouillé, présent dans chaque
collectivité, que seul le Socle attribue ou retire. `acces` reste l'ouverture sans profil ; les
autres profils restent attribués dans Iris. Détail côté Iris : sa fiche « profils de droits ».
Mis en service le 2026-11-10 dans cet ordre : migration Socle, reprise au Socle des 5
administrateurs Iris (rôle `administrateur` sur la racine), migration Iris, `sync-socle-users`
redéployée, synchronisation complète (aucun changement). Dans l'autre ordre, la synchronisation
aurait retiré le profil aux administrateurs existants.

## Iris : le Socle ouvre l'accès, sans rôle (2026-10-30)

Décision : pour Iris, le Socle **ouvre seulement l'accès**. Iris déclare un seul rôle de base,
`acces` (« Accès », migration `iris_role_acces`) ; les profils de droits — donc ce que l'agent
voit et fait — restent attribués **dans Iris**, aucun profil par défaut. Côté Iris : accès ouvert
= compte + appartenance sans profil ; accès retiré = compte banni, appartenance et profils
conservés (le retrait du membre les supprimerait en cascade) ; l'admin plateforme n'est jamais
touché. Reprise : les 9 appartenances Iris hors admin plateforme → 9 accès `acces` sur la
collectivité (6 agents créés au Socle, sans mot de passe ni accès Socle).

## Code et tests

- `src/features/users/agentAccess.ts` (logique pure : fusion, applications proposées, plan
  d'écriture) — `agentAccess.test.ts`.
- `useOrgUsers.ts`, `AccessRolesFields.tsx`, `CreateUserDialog.tsx`, `EditUserDialog.tsx`,
  `UsersManagementPage.tsx` — `UsersManagementPage.test.tsx`.
- Migration `annuaire_agents_acces`. `supabase/functions/invite-user/index.ts`.
