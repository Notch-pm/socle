# Feature : annuaire des agents et accès aux applications

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

**Le Socle décide qui a accès à quelle application, sur quel organisme, avec quel rôle de base**
(décision du 2026-10-30, à la demande des DSI). Les droits fins restent dans chaque application
(profils Iris par démarche, signataire / viseur Clara…). Plan d'ensemble en cinq lots :

| Lot | Contenu | État |
|---|---|---|
| 0 | Étude Keycloak (IdP dédié, fédéré aux annuaires des collectivités) et ADR | à faire |
| 1 | Annuaire et matrice d'accès dans le Socle | **livré dans le code** (2026-10-30) |
| 2 | `GET /v1/users` (scope `users`), lecture incrémentale | **livré dans le code** (2026-10-30, contrat 1.43.0) |
| 3 | Consommation par Clara (`sync-socle-users`, écrans verrouillés), puis Iris | Clara : **codé** (2026-10-30, branche Clara `feature/agents-geres-par-socle`), comptes repris ; Iris : à faire |
| 4 | Connexion OIDC par Keycloak dans chaque application | à faire |

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
« — », badge « Suspendu », actions renvoyer l'invitation (accès Socle seulement), modifier,
suspendre / réactiver, retirer (accès Socle supprimé, accès aux applications désactivés sur cet
organisme). Les agents sans plus aucun accès sont masqués derrière une case à cocher.

## `invite-user`

- Corps : `role` = rôle Socle **ou vide**, `applications: [{ application_id, role_code }]` ; au
  moins un accès. Abonnement et rôle **vérifiés avant toute écriture** (pas de compte orphelin).
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

## Code et tests

- `src/features/users/agentAccess.ts` (logique pure : fusion, applications proposées, plan
  d'écriture) — `agentAccess.test.ts`.
- `useOrgUsers.ts`, `AccessRolesFields.tsx`, `CreateUserDialog.tsx`, `EditUserDialog.tsx`,
  `UsersManagementPage.tsx` — `UsersManagementPage.test.tsx`.
- Migration `annuaire_agents_acces`. `supabase/functions/invite-user/index.ts`.
