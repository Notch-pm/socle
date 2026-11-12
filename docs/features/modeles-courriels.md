# Feature : modèles de courriels (`email_templates`)

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

Les courriels qu'envoient les applications de la gamme aux usagers, et ceux qu'une collectivité
rédige pour ses propres besoins, au même endroit. Livré le 2026-11-12 (contrat `public-api`
1.44.0). Écran : **`/referentiels/modeles-courriels`** (admin de la racine) et section
« Modèles de courriels » d'`OrgSettingsPage` (`?section=courriels`, racine seule, superadmin).

Il y a deux familles dans une seule liste :

| | Courriel **système** | Modèle **créé** |
|---|---|---|
| Origine | catalogue plateforme `email_template_defaults`, posé par migration | ligne `email_templates` à `system_key` NULL |
| Titre, applications | figés (catalogue) | choisis par la collectivité |
| Objet, corps | modifiables (surcharge `email_templates.system_key`) | modifiables |
| Suppression | **jamais** ; « Rétablir le texte d'origine » retire la surcharge | oui |
| Repère pour l'aval | `key` stable (`accuse_reception`…) | `id` |

## Invariants

- ⚠️ **Héritage résolu à la lecture, jamais recopié** (motif charte / SMTP). Une collectivité qui
  ne personnalise rien n'a **aucune ligne** ; elle reçoit le texte du catalogue. Un courriel
  système ajouté demain par migration apparaît chez tous les clients, sans reprise de données.
  La fusion (`resolveEmailTemplates`) est **pure**, écrite en **deux copies byte-identiques**,
  `src/features/email-templates/emailTemplates.ts` et
  `supabase/functions/public-api/_shared/emailTemplates.ts`, épinglées par
  `emailTemplatesMirror.test.ts` (motif `apiKeyAuth.ts`).
- ⚠️ **Le catalogue n'a aucune policy d'écriture** : seule une migration le fait évoluer. C'est ce
  qui rend un courriel système insupprimable — il n'y a rien à supprimer côté client.
- **Seuls l'objet et le corps** d'un courriel système se personnalisent : la contrainte
  `email_templates_name_by_kind` interdit `name`/`description` sur une surcharge, et la policy
  d'écriture de `email_template_applications` refuse un lien posé sur une surcharge.
- ⚠️ **Le Socle enregistre et publie, il ne fusionne rien** (même parti que le catalogue de
  documents). Objet et corps sont du **texte brut** à variables `{{domaine.cle}}` ; une partie
  entre `{{#cle}}` et `{{/cle}}` n'est rendue que si la variable a une valeur ; une ligne vide
  sépare deux paragraphes. **L'habillage reste à l'application** qui envoie : charte, bouton
  « Voir ma demande », pied « message automatique », lien de désinscription — c'est « le contenu,
  pas le template ».
- **Catalogue des variables** (`emailVariables.ts`) : les trois domaines de `documentVariables.ts`
  plus ce qu'il faut à un courriel (`usager.salutation`, `demande.reference`, `demande.objet`,
  `demande.lien`, `demande.code_acces`, `demande.statut_usager`, `demande.commentaire_cloture`,
  domaine `message.*`). C'est un contrat de nommage. Un test vérifie que chaque variable citée par
  les courriels système de la migration y figure. Une variable inconnue est **signalée** à la
  saisie, jamais refusée ; une section mal fermée, elle, est refusée (elle casserait le rendu).
- Multi-tenant strict : `email_templates` se rattache à une **racine**
  (`enforce_email_template_root_org`, EXECUTE révoqué) ; RLS lecture `has_org_access`, écriture
  `is_org_admin`. Titre d'un modèle créé unique par racine, sans tenir compte de la casse.

## Courriels système de départ

Repris **tels quels** des textes d'Iris (`Iris/supabase/functions/_shared/email/{accuse,
avisUsager,cloture,codeAcces}.ts`), application `iris` : `accuse_reception`,
`debut_instruction` (« prise en charge »), `attente_information`, `reprise_instruction`,
`annulation`, `reouverture`, `cloture_positive`, `cloture_negative`, `nouveau_message`,
`code_acces`. La « réponse à l'usager », rédigée librement par l'agent, n'est pas un modèle.
Iris compose parfois deux variantes d'un même courriel (« un / plusieurs messages », code
renvoyé « par l'usager / par un agent ») : le catalogue n'en garde qu'une, formulée pour valoir
dans les deux cas.

## ⚠️ Pièges

- ⚠️ **Iris envoie encore ses textes en dur** tant qu'il n'est pas branché sur
  `GET /v1/email-templates` (roadmap). Modifier un courriel système dans le Socle n'a **aucun
  effet** sur les envois d'ici là. Clara non plus ne lit pas encore ces modèles.
- ⚠️ La **clé** (`key`) d'un courriel système est un contrat : la renommer casse l'application qui
  la cite. On ajoute une clé, on n'en renomme pas.
- Pas d'Ariane dans le registre `applications` (décision du 2026-11-12) : les cases proposées pour
  un modèle créé sont les applications `scope = 'abonnement'` (nora, iris, clara).
- `GET /v1/email-templates?organization_id=` exige une **racine** : une sous-organisation ou une
  organisation hors périmètre répond `404`.

## Code et tests

- Migrations `20261112083009_modeles_courriels` (tables, RLS, trigger) et
  `20261112083049_modeles_courriels_catalogue` (les 10 courriels système).
- `src/features/email-templates/` : `emailTemplates.ts` (pur, miroir), `emailVariables.ts`,
  `useEmailTemplates.ts`, `EmailTemplatesManager.tsx` (tableau : titre, applications, objet),
  `EmailTemplateFormDialog.tsx`, `EmailTemplatesPage.tsx`. `VariablesDialog` (documents) reçoit
  le catalogue en prop.
- API : bloc `/v1/email-templates` de `public-api/index.ts`, `EmailTemplateDto`,
  `serializeEmailTemplate` (le texte d'origine reste à l'écran), schéma OpenAPI `EmailTemplate`.
- Tests : `emailTemplates.test.ts`, `emailVariables.test.ts`, `emailTemplatesMirror.test.ts`,
  `serializers.test.ts`, `openapi.test.ts`, `Sidebar.test.tsx`.
