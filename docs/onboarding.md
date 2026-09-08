# Mise en service

> **Public** : l'éditeur (super administrateur Socle, ops) · **Question traitée** : que faut-il
> faire, une fois pour la plateforme puis à chaque nouveau client, pour qu'une collectivité soit
> servie de bout en bout — Socle, portail (Nora), Iris, Clara ? · **Dernière mise à jour** :
> 2026-09-08

Ce document est une procédure. Le « pourquoi » des choix est dans
[architecture.md](./architecture.md) (journal des décisions du 2026-09-08) ; le détail des
tables dans [data-model.md](./data-model.md) ; les secrets et le déploiement dans
[operations.md](./operations.md).

**La règle** : à l'arrivée d'un client, **rien ne se fait dans Supabase**. Tout ce qui est par
client se fait dans le Socle (et, à leur tour, dans les produits). Ce qui se fait dans Supabase
se fait **une fois**, pour la plateforme.

## 1. La plateforme, une fois

À faire à l'installation de la plateforme, jamais par client.

| # | Geste | Où |
|---|---|---|
| 1 | `AUTH_HOOK_SECRET` + hook « Send Email » pointé sur `auth-email-hook` | Dashboard Supabase → Authentication → Hooks |
| 2 | Redirect URLs `/activer-compte`, `/reinitialiser-mot-de-passe` | Dashboard Supabase → Authentication → URL Configuration |
| 3 | `MISTRAL_API_KEY`, `MISTRAL_AGENT_*` (secrets `ai-api`) | `supabase secrets set` |
| 4 | **`PLATFORM_SMTP_*`** — le relais de messagerie de la plateforme, repli des courriels d'authentification (invitation, activation, mot de passe oublié) tant qu'une collectivité n'a pas le sien | `supabase secrets set` — voir [operations.md](./operations.md) |
| 5 | `supabase/config.toml` (`verify_jwt` par fonction), cron `release-stale-ai-reservations` | CLI / SQL |
| 6 | Le premier super administrateur (`handle_new_user` : premier inscrit = `super_admin`) | Dashboard Supabase |
| 7 | **Réglages de plateforme** : zone des sous-domaines fournis (ex. `demarches.edilumen.fr`), cible CNAME des domaines personnalisés, plafond IA par défaut | Socle → `/superadmin/plateforme` |
| 8 | **Applications** : une clé par application de la gamme (Nora : `read` ; Iris et Clara : `read` + `contacts` + `smtp` + `ai` ; Socle : `ai`, scope `plateforme`), posée une fois dans le projet de chaque application (`SOCLE_API_KEY`, et `SOCLE_AI_API_KEY` pour `translate-labels`) | Socle → `/superadmin/applications`, puis les secrets de chaque projet |
| 9 | **DNS wildcard** `*.<zone>` vers l'hébergeur du portail, avec un certificat wildcard | Hébergeur de Nora — hors Socle |

Le point 8 remplace « une clé par client et par application » : la clé d'une application ne voit
que les collectivités **abonnées** à cette application (section « Applications souscrites » de
chaque client). Aucun secret ne circule plus à l'arrivée d'un client.

## 2. Un client, à chaque fois — sans SQL

1. **Créer l'organisation principale** (« + » du rail, nom, coordonnées, slug). Le Socle pose de
   lui-même, par le trigger `provision_root_organization` :
   - les **rôles de contact** (le référentiel des usagers refuserait toute attribution sans eux) ;
   - le **plafond IA par défaut** de la plateforme, s'il est réglé ;
   - le **sous-domaine fourni** `<slug>.<zone>`, si la zone est réglée — le DNS wildcard y répond
     déjà, rien à faire.
2. **Cocher ses applications** (section « Applications souscrites ») : Nora pour le portail, Iris,
   Clara. C'est ce qui donne à la clé de chaque application le droit de voir ce client. Iris et
   Clara créent alors leur tenant à leur prochaine synchronisation (voir § 4).
3. **Dérouler la check-list « Mise en service »** en tête de la page du client. Chaque ligne mène à
   sa section :
   - relais de messagerie (SMTP) de la collectivité — sans lui, seuls les courriels
     d'authentification partent, par le relais de plateforme ;
   - un premier administrateur invité (bouton « Renvoyer l'invitation » si le courriel s'est perdu) ;
   - au moins une catégorie (obligatoire pour créer une démarche) ;
   - une démarche en production, et **activée** par au moins un organisme de l'arbre — une
     démarche que personne n'active n'est servie par aucun portail ;
   - un domaine pour le portail (posé à la création si la zone est réglée) ;
   - la page d'accueil du site publiée (facultatif : sans elle, le portail rend sa mise en page
     par défaut) ;
   - le plafond IA décidé (« illimité » est un choix explicite, pas un oubli) ;
   - le logo (facultatif).
4. Rien d'autre. Ni clé, ni secret, ni ligne SQL.

Une collectivité créée **avant** les réglages de plateforme n'a reçu ni sous-domaine ni plafond :
le bouton « Rejouer le provisioning » de `/superadmin/plateforme` pose ce qui manque, sans toucher
à ce qui existe.

## 3. Domaines du portail

- **Sous-domaine fourni** (`<slug>.<zone>`) : attribué à la création, badge « Sous-domaine
  fourni » dans l'écran des domaines. Le DNS wildcard de la zone y répond ; aucun geste. ⚠️ Un
  slug renommé après coup **ne renomme pas** le sous-domaine : une adresse publique ne bouge pas
  toute seule.
- **Domaine personnalisé** (`demarches.ville.fr`) : réservé au super administrateur. (1) Le client
  crée un enregistrement **CNAME** vers la cible affichée dans l'écran des domaines
  (`portal_cname_target`, réglage de plateforme) ; (2) le super administrateur enregistre le
  domaine chez l'hébergeur du portail (certificat) ; (3) il l'ajoute dans la section « Domaines du
  portail » du client. Les administrateurs de la collectivité **lisent** leurs domaines et voient
  la cible CNAME ; ils n'en posent pas.
- Un domaine désigne exactement une collectivité (unicité globale), et le portail ne répond sur
  ses domaines qu'une fois **Nora cochée** dans les applications souscrites.

## 4. Ce que chaque application fait de son côté

Ces gestes vivent dans les dépôts des applications ; ils sont listés ici pour que la procédure
soit complète. État au 2026-09-08 : à mettre en œuvre.

- **Nora** — rien par client. La clé plateforme de Nora (scope `read`, application `nora`) résout
  les domaines des collectivités abonnées. Reste côté hébergement : le wildcard DNS et, pour les
  domaines personnalisés, leur enregistrement. Reste côté dépôt : retirer `PORTAL_DEV_DOMAIN_SUFFIX`
  de la fonction déployée, et une **clé d'ingestion Iris plateforme** (une par tenant aujourd'hui,
  ce qui bloque le dépôt multi-collectivités).
- **Iris** — la clé plateforme d'Iris (application `iris`) voit exactement ses clients par
  `GET /v1/organizations` : créer ses tenants **à la synchronisation** pour toute racine du
  périmètre encore inconnue, au lieu d'un `insert` SQL. Puis, dans Iris : profils de droits,
  invitation du premier administrateur.
- **Clara** — même principe (le bouton « Importer depuis le référentiel » devient un raccourci) ;
  retirer le vestige `SOCLE_CONTACTS_API_KEYS` ; connecteur Iris à configurer depuis un écran.

## 5. Vérifier qu'un client est servi

- La check-list du client est complète (les lignes facultatives peuvent rester ouvertes).
- `GET /v1/portal/tenant?hostname=<domaine>` avec la clé de Nora répond 200 ; avec la clé d'une
  application non souscrite, 404.
- Les synchronisations d'Iris et de Clara listent la collectivité.
- Un courriel d'invitation envoyé depuis la page du client arrive (relais de la collectivité, ou
  de la plateforme en repli — le journal de la fonction dit lequel : `relais=collectivite` ou
  `relais=plateforme`).
