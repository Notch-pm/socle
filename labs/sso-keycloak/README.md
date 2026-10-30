# Lab — connexion unique par Keycloak (lot 0 de l'annuaire des agents)

Étude **locale** de la cible « Keycloak authentifie, le Socle autorise »
([fiche](../../docs/features/agents-et-acces.md), ADR dans
[architecture.md](../../docs/architecture.md)). Rien ici ne touche la production.

## Ce que contient le lab

- **Keycloak 26** (`docker-compose.yml`), deux realms importés au démarrage (`realms/`) :
  - `edilumen` — le fournisseur d'identité de la gamme ; client `supabase-lab` ; un compte
    local `agent.local@edilumen.test` (collectivité sans annuaire) ;
  - `mairie-demo` — joue **l'annuaire d'une collectivité** (le rôle d'Entra ID), fédéré dans
    `edilumen` par OIDC (fournisseur `mairie-demo`) ; comptes `agent.mairie` et `intrus`.
- **Supabase local** (`supabase/config.toml`, Auth seul) configuré comme le serait chaque
  application : provider `keycloak` activé, **inscriptions fermées**.

## Lancer

```bash
# LAB_HOST = l'IP de la machine sur le réseau local (pas localhost, voir « Pièges »)
cp .env.example .env && cp .env.example supabase/.env   # puis ajuster LAB_HOST
# et reporter LAB_HOST dans supabase/config.toml ([auth.external.keycloak] url)
docker compose up -d
npx supabase start --workdir . -x studio,imgproxy,storage-api,realtime,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit,postgrest
```

Provisionner les comptes comme le ferait `sync-socle-users` (clé secrète affichée par
`supabase start`) :

```bash
curl -X POST http://127.0.0.1:54321/auth/v1/admin/users -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" -d '{"email":"agent.mairie@mairie-demo.fr","email_confirm":false}'
curl -X POST http://127.0.0.1:54321/auth/v1/admin/users -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" -d '{"email":"agent.local@edilumen.test","email_confirm":true}'
```

Puis ouvrir dans un navigateur
`http://127.0.0.1:54321/auth/v1/authorize?provider=keycloak&redirect_to=http://127.0.0.1:3000&scopes=openid`
(ajouter `&kc_idp_hint=mairie-demo` pour aller droit à l'annuaire de la mairie). La dernière
redirection vers `127.0.0.1:3000` échoue (aucune application n'y tourne) : le résultat se lit dans
`auth.users` / `auth.identities` et les journaux du conteneur `supabase_auth_sso-keycloak`.

Arrêter : `npx supabase stop --workdir .` puis `docker compose down`.

## Résultats (2026-10-30)

| # | Scénario | Résultat |
|---|---|---|
| A | Agent **provisionné** (créé comme par la sync : sans mot de passe, non confirmé), connexion par l'annuaire de sa collectivité avec `kc_idp_hint` | ✅ Envoyé **directement** à l'annuaire de la mairie (la page Keycloak n'apparaît pas) ; retombe sur **le même compte** (même `id`), identité `keycloak` rattachée, e-mail confirmé. |
| B | Agent authentifié par son annuaire mais **non provisionné** | ✅ Refusé : `422 Signups not allowed for this instance`, aucun compte créé. |
| C | Compte **local** Keycloak (collectivité sans annuaire), sans indice | ✅ Page Edilumen avec le formulaire local **et** le bouton « Compte de la Mairie » ; retombe sur le compte provisionné. |
| D | **Connexion unique** : deuxième connexion avec la session Keycloak ouverte | ✅ Aucune page de connexion, session ouverte directement. |
| E | Agent **banni** (suspension au Socle → sync) avec une session Keycloak valide | ✅ Refusé : `403 User is banned`. |
| F | Sans le scope `openid` | ❌ `403` sur `userinfo` de Keycloak : **le scope `openid` est obligatoire** (voir Pièges). |

Le point d'arrêt du plan (le rattachement d'une identité Keycloak à un compte **pré-créé** avec
les inscriptions fermées) est levé : **aucun pont maison n'est nécessaire**.

## Pièges relevés

- ⚠️ **`scopes: 'openid'`** dans `signInWithOAuth({ provider: 'keycloak', options: { scopes:
  'openid', queryParams: { kc_idp_hint } } })` : le provider `keycloak` de Supabase demande
  `profile email` sans `openid`, et Keycloak ≥ 25 refuse alors `userinfo` (403, « Error getting
  user profile from external provider »).
- ⚠️ **Une seule adresse pour Keycloak**, vue à l'identique par le navigateur et par Supabase
  Auth (c'est aussi l'émetteur des jetons). En production c'est un nom de domaine public ; en
  local, l'IP de la machine (Windows ne résout pas `host.docker.internal`).
- La fédération avec l'annuaire se règle **dans Keycloak** (un fournisseur d'identité par
  collectivité, `trustEmail`), jamais dans les applications : elles ne connaissent que le realm
  `edilumen`. Keycloak crée l'utilisateur fédéré chez lui (y compris `intrus`) — sans effet :
  c'est le provisionnement par le Socle qui ouvre une application.
- La découverte de l'annuaire se fait par `kc_idp_hint` = l'alias du fournisseur de la
  collectivité : l'application le déduit du domaine de l'e-mail saisi (table du Socle, lot 4).
