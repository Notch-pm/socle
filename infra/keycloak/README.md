# Keycloak de production — connexion unique de la gamme

Le fournisseur d'identité commun au Socle, à Clara et à Iris (lot 4 de
l'[annuaire des agents](../../docs/features/agents-et-acces.md)). **Keycloak authentifie, le
Socle autorise** : un agent ne se connecte à une application que si le Socle la lui a ouverte
(compte pré-créé par la synchronisation, inscriptions fermées). Décision et raisons : ADR du
2026-10-30 dans [`architecture.md`](../../docs/architecture.md) ; étude préalable :
[`labs/sso-keycloak/`](../../labs/sso-keycloak/README.md).

| | |
|---|---|
| Serveur | VPS OVH **VPS-1** (2 vCores, 4 Go, 40 Go NVMe), datacenter **France**, Debian 12, sauvegarde automatique OVH |
| Adresse | `https://auth.edilumen.fr` (realm `edilumen`) |
| Conteneurs | `caddy` (HTTPS, seul exposé) → `keycloak` 26 → `postgres` 16 |
| Console d'administration | **jamais publique** : par tunnel SSH (étape 5) |

Contenu du dossier : `docker-compose.yml`, `Caddyfile`, `.env.example`,
`realms/edilumen-realm.json` (importé au premier démarrage), `themes/edilumen/` (habillage de
la page de connexion), `bootstrap-server.sh` (préparation du VPS), `backup.sh` (sauvegarde
quotidienne).

## Installation (une fois)

Les commandes « poste » se tapent dans PowerShell sur ton ordinateur, les commandes « serveur »
dans la session SSH. `IP` = l'adresse du VPS reçue d'OVH.

### 0. DNS

Créer l'enregistrement **A** `auth.edilumen.fr` → `IP`. ⚠️ S'il est géré chez Cloudflare :
**« DNS only » (nuage gris)**, pas proxifié — Keycloak doit voir l'adresse réelle des
navigateurs (protection contre les essais de mots de passe) et Caddy obtenir son certificat
lui-même.

### 1. Clé SSH (poste)

```powershell
ssh-keygen -t ed25519                     # si tu n'as pas déjà ~/.ssh/id_ed25519
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh debian@IP "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys"
ssh debian@IP                             # doit entrer sans mot de passe
```

### 2. Préparer le serveur (poste puis serveur)

```powershell
scp infra/keycloak/bootstrap-server.sh debian@IP:~
ssh debian@IP "sudo bash ~/bootstrap-server.sh"
```

Le script met le système à jour, ajoute 2 Go de swap, installe Docker, ferme tout sauf
SSH/80/443, **désactive les mots de passe SSH** (la clé de l'étape 1 suffit) et crée
`/opt/keycloak`. Se déconnecter puis se reconnecter ensuite (groupe `docker`).

### 3. Déposer les fichiers et les secrets

```powershell
scp -r infra/keycloak/docker-compose.yml infra/keycloak/Caddyfile infra/keycloak/backup.sh infra/keycloak/realms infra/keycloak/.env.example debian@IP:/opt/keycloak/
```

```bash
cd /opt/keycloak && cp .env.example .env && chmod 600 .env && chmod +x backup.sh
openssl rand -base64 32   # → POSTGRES_PASSWORD
openssl rand -base64 32   # → KC_BOOTSTRAP_ADMIN_PASSWORD
nano .env                 # remplir les deux mots de passe
```

Ranger aussi ces deux valeurs dans le gestionnaire de mots de passe.

### 4. Démarrer

```bash
docker compose up -d
docker compose logs -f keycloak    # attendre « Keycloak 26… started », puis Ctrl+C
```

Vérifier depuis le poste : `https://auth.edilumen.fr/realms/edilumen/.well-known/openid-configuration`
répond en JSON avec `"issuer": "https://auth.edilumen.fr/realms/edilumen"`, et
`https://auth.edilumen.fr/admin/master/console/` répond **404** (console fermée au public).

### 5. Ouvrir la console d'administration (poste)

⚠️ **Une fois, avant la première ouverture** (serveur) : donner au realm `master` l'adresse du
tunnel. Sinon la console, servie sur `localhost:8080`, vérifie la session auprès de
`https://auth.edilumen.fr/realms/master/…` — que Caddy bloque — et affiche « Something went
wrong » (`Timeout when waiting for 3rd party check iframe message`, piège rencontré le
2026-11-06). Le réglage vit en base (donc dans les sauvegardes) :

```bash
cd /opt/keycloak && set -a && . ./.env && set +a
docker compose exec -T keycloak bash -c "/opt/keycloak/bin/kcadm.sh config credentials   --server http://localhost:8080 --realm master --user \"$KC_BOOTSTRAP_ADMIN_USERNAME\"   --password \"$KC_BOOTSTRAP_ADMIN_PASSWORD\" && /opt/keycloak/bin/kcadm.sh update realms/master   -s attributes.frontendUrl=http://localhost:8080"
```

Vérifier : `curl -s http://localhost:8080/realms/master/.well-known/openid-configuration` donne
`"issuer":"http://localhost:8080/realms/master"` (le realm `edilumen`, lui, reste sur
`https://auth.edilumen.fr`).

Puis, sur le poste :

```powershell
ssh -L 8080:127.0.0.1:8080 debian@IP
```

Puis, tant que cette session est ouverte : `http://localhost:8080/admin/`.

### 6. Remplacer le compte d'amorçage

Connecté avec `amorcage` dans le realm **master** :

1. *Users → Add user* : un administrateur **nominatif** ; *Credentials* : mot de passe fort ;
   *Required user actions* : **Configure OTP** (double authentification obligatoire).
2. *Role mapping → Assign role* : `admin` (realm `master`).
3. Se déconnecter, se reconnecter avec ce compte (et l'OTP), puis **supprimer `amorcage`**.
4. Sur le serveur : vider `KC_BOOTSTRAP_ADMIN_PASSWORD` dans `.env` n'est pas possible (la
   variable est exigée) — y mettre une nouvelle valeur aléatoire suffit : elle ne sert plus
   (Keycloak ne crée le compte d'amorçage que si `master` n'a aucun administrateur).

### 7. Sauvegardes

```bash
/opt/keycloak/backup.sh                       # premier essai
crontab -e                                    # puis ajouter :
30 3 * * * /opt/keycloak/backup.sh >> /opt/keycloak/backups/backup.log 2>&1
```

Restaurer (après un incident) :

```bash
cd /opt/keycloak && docker compose stop keycloak
gunzip -c backups/keycloak-AAAAMMJJ-HHMM.sql.gz | docker compose exec -T postgres psql -U keycloak -d keycloak
docker compose start keycloak
```

### 8. Réglages du realm `edilumen`

Dans la console, realm **edilumen** :

- *Realm settings → Email* : l'expéditeur de la plateforme (valeurs des secrets
  `PLATFORM_SMTP_*`, cf. [`operations.md`](../../docs/operations.md)) — sert aux comptes
  **locaux** (collectivité sans annuaire) pour réinitialiser leur mot de passe.
- *Clients → socle / clara / iris → Credentials* : le **secret** de chacun, à reporter dans le
  provider `keycloak` de Supabase Auth de l'application correspondante (*Authentication →
  Providers → Keycloak*, URL `https://auth.edilumen.fr/realms/edilumen`). ⚠️ À ne faire qu'avec
  le code du lot 4 (bouton « compte de ma collectivité ») et ses inscriptions fermées.

### 9. Thèmes : page de connexion et e-mails

`themes/edilumen/login/` habille la page que voient les agents : charte de la gamme (vert,
Nunito Sans **auto-hébergée**, logo Edilumen, favicon du site institutionnel
`www.edilumen.fr` converti en `favicon.ico` 16/32/48 px), textes français de la gamme
(« Adresse e-mail », « Créer mon compte »…), pied « Un seul compte pour Socle, Iris et Clara ».
Il hérite de `keycloak.v2` et ne réécrit **aucun** formulaire : seulement des variables
PatternFly, la mise en page, `footer.ftl` et `messages_fr.properties`.

`themes/edilumen/email/` habille les e-mails de Keycloak (vérification d'adresse, mot de passe
oublié, action demandée, changement d'adresse, liaison d'annuaire, essai) avec le **cadre des
e-mails de la gamme** — reprise de `renderBrandedEmail` (`invite-user/_shared/emailLayout.ts`) :
colonne de 520 px, bandeau blanc, bouton vert, lien de repli, version Outlook. Les alertes de
sécurité que le thème ne réécrit pas gardent leur texte, dans le même cadre.

Déployer ou mettre à jour (poste, puis serveur) :

```bash
scp -r infra/keycloak/themes infra/keycloak/docker-compose.yml debian@IP:/opt/keycloak/
```

```bash
cd /opt/keycloak && docker compose up -d keycloak
```

Puis, la première fois, dans la console (realm **edilumen**) : *Realm settings → Themes →
Login theme* = `edilumen` et *Email theme* = `edilumen` ; *Realm settings → General → HTML display name* = « Une seule
connexion pour toutes vos applications » (l'import du realm les porte déjà, mais il n'est joué
qu'au premier démarrage). ⚠️ Keycloak met les thèmes en cache : après une mise à jour du thème,
`docker compose restart keycloak`.

## Brancher l'annuaire d'une collectivité (Entra ID)

Un **fournisseur d'identité par collectivité**, dans le realm `edilumen` ; les applications n'en
savent rien (elles passent seulement `kc_idp_hint` = l'alias).

1. **Chez la collectivité** (Entra ID → *App registrations → New registration*) : URI de
   redirection `https://auth.edilumen.fr/realms/edilumen/broker/<alias>/endpoint` ; créer un
   *client secret* ; noter l'*ID d'annuaire (tenant)* et l'*ID d'application*.
2. **Dans Keycloak** : *Identity providers → OpenID Connect v1.0* ; alias = `<alias>` (ex.
   `vernon`, en minuscules, définitif) ; *Discovery endpoint* =
   `https://login.microsoftonline.com/<tenant>/v2.0/.well-known/openid-configuration` ;
   *Client ID / Secret* = ceux d'Entra ; *Client authentication* = « Client secret sent as
   post » ; *Scopes* = `openid email profile` ; **Trust email = ON** ; *Sync mode* = Import.
   ⚠️ Aucune espace parasite en collant le *Discovery endpoint* : l'ajout échoue sans message
   clair (`Illegal character in scheme name at index 0` dans les journaux) et le fournisseur
   n'existe pas. Vérifier qu'il apparaît dans la liste.
3. Tester : ouvrir `https://auth.edilumen.fr/realms/edilumen/account/` en navigation privée et
   cliquer sur le **bouton** de la collectivité sous le formulaire (jamais le formulaire : il
   ne connaît que les comptes locaux, un compte Entra y donne `user_not_found`). On doit passer
   par `login.microsoftonline.com` puis revenir sur la page « Compte ». ⚠️ Ne pas tester avec
   `/account/?kc_idp_hint=<alias>` : la page compte **perd** l'indice (constaté le 2026-11-06) ;
   les applications, elles, le passent à l'autorisation et vont droit chez Microsoft.

⚠️ Un agent authentifié par son annuaire mais **non provisionné** par le Socle est refusé par
l'application (inscriptions fermées, scénario B du lab) — Keycloak le connaît, ça ne lui ouvre
rien.

## Exploitation

- **Mises à jour** : Debian se met à jour seul (sécurité). Conteneurs :
  `docker compose pull && docker compose up -d` — ⚠️ pour Keycloak, changer la version épinglée
  dans `docker-compose.yml` **après lecture des notes de version**, et sauvegarder avant.
- **Surveillance** : une sonde externe (ex. UptimeRobot, gratuit) sur
  `https://auth.edilumen.fr/realms/edilumen/.well-known/openid-configuration`. Si Keycloak
  tombe, **plus personne ne se connecte par SSO** : les collectivités en `password` ne sont pas
  touchées.
- **Passer au VPS-2** (espace client OVH, sans réinstaller) : remonter `mem_limit` de keycloak
  à `3g`, puis `docker compose up -d`.
- **Journaux** : `docker compose logs --since 1h keycloak`. Les événements de connexion sont
  conservés 180 jours dans Keycloak (*Realm settings → Events*).
