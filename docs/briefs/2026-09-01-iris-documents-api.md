# Brief Iris — brancher les documents et courriers d'une démarche

> **Public** : agent Claude (et devs) du repo **Iris** · **Nature** : instantané daté du
> **2026-09-01**, non maintenu — la référence vivante est l'OpenAPI publié
> (`{base}/openapi.json`, rendu sur `/api-doc`) et `docs/api-changelog.md` du repo Socle ·
> **Contact** : super admin Socle.

Tu as déjà le front et le moteur de fusion. Ce brief ne couvre que le **branchement API** :
où lire la liste des documents d'une démarche, comment récupérer le fichier, et quelle règle
d'affichage appliquer. Rien à migrer en base côté Iris.

---

## 1. L'essentiel en cinq points

1. **Un paramétreur choisit, par démarche, quels documents l'agent peut produire.** Deux
   sous-groupes : **Documents** (modèles `interne`/`externe`) et **Courriers** (modèles
   `courrier`).
2. **La liste te parvient déjà résolue** dans `GET /v1/procedures/{id}`, champ `documents` :
   libellé, type, groupe, nom de fichier, condition. **Un seul appel** suffit pour afficher.
3. **Le fichier s'obtient par une URL signée** valable 5 minutes, à partir de l'identifiant du
   document. Le chemin de stockage n'est jamais exposé.
4. **Le Socle ne fusionne rien.** Il stocke le `.docx`/`.odt` et dit lequel s'applique ; c'est
   Iris qui remplace les variables. Le §5 donne la liste exacte des jetons.
5. **Le Socle ne sait pas si une demande est positive ou négative.** C'est Iris qui le sait, et
   qui applique donc la règle de visibilité du §4.

**Base** : `https://qhrokbkyxgcvkbpmbmna.supabase.co/functions/v1/public-api`
**Auth** : `Authorization: Bearer sk_live_…` — scope **`read`** requis (403 sinon).
Serveur-à-serveur uniquement, jamais de clé dans un navigateur.
**Version du contrat** : **1.6.0** (les trois endpoints ci-dessous sont l'ajout du 2026-09-01).

---

## 2. Les trois lectures

### a) La sélection d'une démarche — `GET /v1/procedures/{id}`

Champ `documents` (présent aussi sur `GET /v1/procedures`, donc utilisable en liste) :

```json
{
  "id": "…",
  "name": "Demande d'intervention voirie",
  "documents": {
    "restrict_visibility": true,
    "items": [
      {
        "id": "6f1c…",
        "name": "Notice explicative",
        "description": null,
        "type": "interne",
        "group": "document",
        "file_name": "notice.docx",
        "visibility": "toujours"
      },
      {
        "id": "a92b…",
        "name": "Lettre d'acceptation",
        "description": null,
        "type": "courrier",
        "group": "courrier",
        "file_name": "acceptation.docx",
        "visibility": "positive"
      },
      {
        "id": "c47d…",
        "name": "Lettre de refus",
        "description": null,
        "type": "courrier",
        "group": "courrier",
        "file_name": "refus.docx",
        "visibility": "negative"
      }
    ]
  }
}
```

- `group` vaut `document` ou `courrier` : c'est le découpage à reprendre dans ton interface
  (deux sections). `type` reste la qualification fine du catalogue (`interne`/`externe`/`courrier`).
- `items` est **dans l'ordre du paramétrage** : documents d'abord, courriers ensuite. Respecte-le.
- Démarche jamais passée par l'étape Communication ⇒ `{"restrict_visibility": false, "items": []}`.
  Aucun document n'est proposé tant qu'il n'a pas été choisi.

### b) Le fichier — `GET /v1/document-templates/{id}/signed-url`

```json
{
  "url": "https://…/object/sign/document-templates/…?token=…",
  "file_name": "acceptation.docx",
  "expires_at": "2026-09-01T19:17:15.648Z"
}
```

L'URL est valable **5 minutes**. Télécharge dans la foulée ; ne la mets ni en cache ni en base,
redemande-la au besoin. `id` = l'`id` d'un `item` du §2a.

### c) Le catalogue complet — `GET /v1/document-templates` *(optionnel)*

Tous les modèles du périmètre de la clé, filtrables : `?type=interne|externe|courrier`.
`GET /v1/document-templates/{id}` pour une fiche seule. Utile pour un écran d'administration ;
**inutile pour l'usage courant**, où le §2a te donne déjà tout.

---

## 3. Erreurs

Enveloppe `{"error": {"code": "…", "message": "…"}}`.

| Code HTTP | Quand |
|---|---|
| `400` | UUID mal formé, `type` hors des trois valeurs |
| `401` | clé absente ou invalide |
| `403` | clé sans le scope `read` |
| `404` | document inexistant **ou hors du périmètre de ta clé** (on ne révèle pas son existence) |
| `405` | toute méthode autre que `GET` |

---

## 4. La règle d'affichage — la seule qui compte

```
si documents.restrict_visibility est faux :
    afficher TOUS les items
sinon, pour chaque item :
    afficher si item.visibility == "toujours"
           ou (demande close positivement et item.visibility == "positive")
           ou (demande close négativement et item.visibility == "negative")
```

⚠️ **N'applique jamais `visibility` sans avoir lu `restrict_visibility` d'abord.** Les conditions
sont **conservées** quand le paramétreur désactive la restriction — c'est délibéré, pour qu'un
retour en arrière ne perde aucun réglage. Un item peut donc porter `visibility: "negative"` alors
que `restrict_visibility` est faux : dans ce cas il doit s'afficher **toujours**. L'ignorer
masquerait des documents que la collectivité a rendus visibles.

⚠️ Tant que la demande n'est pas close, `positive` et `negative` ne s'appliquent ni l'un ni
l'autre : seuls les `toujours` sont proposés.

---

## 5. La fusion : les variables des modèles

Les fichiers contiennent des jetons **moustaches** que **c'est à toi de remplacer** :
`{{domaine.cle}}`, et une **boucle** pour les listes.

⚠️ Ce catalogue n'est **pas** exposé par l'API à ce jour (il est figé dans le code Socle). La
liste ci-dessous fait foi ; toute évolution passera par `docs/api-changelog.md`.

### Usager — `{{usager.*}}` — source : **`contacts-api`**

`nom` · `prenom` · `civilite` · `adresse_complete` · `numero` · `btq` · `voie` · `complement` ·
`appartement` · `batiment` · `code_postal` · `ville` · `telephone_mobile` · `courriel` ·
`quartier` · `telephone_fixe`

⚠️ Les composantes fines d'adresse (`numero`, `btq`, `voie`, `complement`, `appartement`,
`batiment`) **n'existent pas** au référentiel Socle, qui ne porte que `address_line1/2`,
`postal_code`, `city`. Ces jetons sont réservés pour plus tard : décide de ta politique de repli
(chaîne vide plutôt que « undefined »). `adresse_complete` et `quartier`, eux, sont servis.

### Demande — `{{demande.*}}` — source : **Iris lui-même**

`libelle_demarche` · `code_suivi` · `categorie` · `organisme_responsable` · `date_depot` ·
`date_echeance` · `urgence` · `etat_actuel` · `date_cloture` · `etat_cloture` · `agent_nom` ·
`agent_prenom` · `agent_courriel`

Aucune de ces données ne vit dans le Socle : c'est ton domaine.

**Les pièces sont une boucle**, pas une variable plate — autant de lignes que le dossier compte
de pièces, clés **relatives** à l'intérieur :

```
{{#demande.pieces}}
{{libelle}} : {{statut}}
{{/demande.pieces}}
```

### Organisme — `{{organisme.*}}` — source : **`public-api`**

`nom` · `adresse` · `telephone` · `courriel` → `GET /v1/organizations/{id}`
`logo_url` · `logo_blanc_url` · `couleur_principale` · `couleur_secondaire` →
**`GET /v1/organizations/{id}/branding`**

⚠️ **Prends la charte sur `/branding`, jamais sur les colonnes de l'organisation.** Une
sous-organisation qui hérite a ses colonnes de charte **nulles** : tu peindrais du vide. La
ressource `/branding` sert la charte **applicable**, héritage déjà résolu, et
`source_organization_id` dit qui la porte.

⚠️ `logo_url` et `logo_blanc_url` sont des **URL d'image** : ton moteur doit *insérer une image*,
pas coller l'adresse — sinon le courrier affiche une ligne d'URL à la place du logo. Les couleurs
sont des `#rrggbb`.

---

## 6. Les cinq pièges

1. **Ne reconstruis pas la liste depuis `communication_config.documents`.** Ce bloc brut ne porte
   que des identifiants, et une sélection peut **survivre à son document** (le paramétrage vit
   dans un JSON sans clé étrangère). `documents.items` a déjà écarté ces références mortes.
2. **`restrict_visibility` d'abord, `visibility` ensuite** — cf. §4.
3. **`file_path` n'existe pas dans l'API**, et n'existera pas. Ne tente pas de composer une URL de
   stockage : la garde de périmètre porte sur la ligne, pas sur une chaîne que tu fournirais.
4. **`GET /v1/documents/signed-url` n'est PAS cet endpoint.** Il sert, depuis toujours et à partir
   d'un *chemin*, les documents de la **base de connaissances** d'une démarche (bucket
   `procedure-documents`) — autre ressource, autre bucket. Le tien est
   `/v1/document-templates/{id}/signed-url`.
5. **Ne stocke pas l'URL signée** (5 minutes).

---

## 7. Ce que le Socle ne fera pas pour toi

- **Fusionner.** Il te donne le modèle et les valeurs de son domaine ; le remplacement est chez toi.
- **Valider le contenu d'un modèle.** Aucune vérification que les jetons employés existent : Word
  découpe volontiers `{{usager.nom}}` en plusieurs fragments XML, une détection naïve mentirait.
  Prévois un comportement propre pour un jeton inconnu (le laisser tel quel ou le vider — mais
  décide, et sois constant).
- **Convertir.** Les fichiers sortent tels qu'ils ont été déposés : `.doc`, `.docx` ou `.odt`.
  Pas de PDF, pas de rendu.
- **Dire si une demande est positive ou négative.** C'est ton information.

---

## 8. Vérifier ton branchement

Demande une clé de test au super admin Socle (scope `read`), puis :

```bash
API=https://qhrokbkyxgcvkbpmbmna.supabase.co/functions/v1/public-api
K="Authorization: Bearer <ta-clé>"

curl -s "$API/openapi.json" | jq '.info.version'          # -> "1.6.0"
curl -s -H "$K" "$API/v1/document-templates" | jq 'length'
curl -s -H "$K" "$API/v1/procedures/<id>" | jq '.documents'
curl -s -H "$K" "$API/v1/document-templates/<id>/signed-url" | jq
```

Points à cocher : les deux `group` alimentent bien tes deux sections · un item `positive` reste
masqué sur une demande non close · le même item s'affiche quand `restrict_visibility` est faux ·
le téléchargement rend un fichier dont les premiers octets sont `PK` (`.docx`/`.odt` sont des zip)
· un document d'une autre collectivité répond `404`.
