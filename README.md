# Socle

Socle est le **référentiel central** de la gamme logicielle **Edilumen** : la source de
vérité unique pour le paramétrage des **organisations**
(hiérarchie de collectivités et de services), des **démarches** (catalogue, catégories,
activation par organisation), des **quartiers** (découpage territorial) et du **référentiel des
citoyens/usagers**. Les autres applications de la gamme — **Ariane**, **Clara**, **Iris**, et à
terme un portail citoyen — ne redéfinissent pas ces données : elles les consomment via les APIs
de Socle. Interface en français.

## Stack

- **Vite 8** (rolldown) + **React 18** + **TypeScript** strict + **React Router 6** +
  **TanStack Query 5** pour les données serveur.
- **Supabase** (Postgres + Auth + RLS) via `@supabase/supabase-js` — la sécurité est appliquée
  en base (RLS), l'UI ne fait que la refléter.
- **Tailwind CSS 3** + primitives **Radix UI** (composants maison façon shadcn dans
  `src/components/ui`), tokens du Notch / Ariane Design System.

## Démarrage

Prérequis : **Node ≥ 22** (exigé par `@supabase/supabase-js`), en pratique **Node 24 / npm 11**
(détails et pièges CI : [docs/operations.md](docs/operations.md)).

```bash
npm install
cp .env.example .env.local   # puis renseigner les deux variables ci-dessous
npm run dev                  # http://localhost:5173
```

`.env.local` (non versionné) doit définir :

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Le client Supabase (`src/lib/supabase.ts`) échoue au démarrage si l'une des deux manque.

Autres commandes :

```bash
npm run build    # tsc -b && vite build
npm run lint     # tsc -b (typecheck du projet, pas d'ESLint)
npm test         # vitest run (npm run test:watch en veille)
```

## APIs

Socle expose deux edge functions Supabase, en clé API (`Authorization: Bearer <clé>`) :

- **`public-api`** — référentiel en **lecture seule** (organisations, démarches, catégories,
  types de pièce justificative, quartiers, URLs signées de documents).
- **`contacts-api`** — référentiel des usagers, **lecture/écriture** (scope de clé dédié).

Documentation interactive (Redoc), consultable sans compte : **`/api-doc`** et
**`/api-doc-usagers`** sur l'app déployée. Détails de contrat, isolation et scopes :
[docs/integration.md](docs/integration.md).

## Documentation

| Document | Pour qui | Contenu |
|---|---|---|
| [CLAUDE.md](CLAUDE.md) | Devs & agents IA | Règles de dev, invariants de sécurité, pièges, pointeurs de code — la référence la plus à jour |
| [docs/architecture.md](docs/architecture.md) | Devs | Zones applicatives, frontières système, modèle de sécurité, décisions et dette |
| [docs/data-model.md](docs/data-model.md) | Devs & ops | Tables, contraintes, triggers, RLS, RPC, extensions, storage |
| [docs/integration.md](docs/integration.md) | Équipes consommatrices (Ariane, Clara, Iris) | Obtention de clé, scopes, garanties d'isolation, politique de compatibilité |
| [docs/api-changelog.md](docs/api-changelog.md) | Équipes consommatrices | Journal daté des évolutions du contrat public |
| [docs/operations.md](docs/operations.md) | Ops | Déploiement, secrets, migrations, CI |
| [docs/roadmap.md](docs/roadmap.md) | Tous | Évolutions envisagées, non engagées sauf mention |
| [docs/archive/](docs/archive/) | — | Instantanés historiques, non maintenus |

Les endpoints, paramètres et schémas de réponse ne sont documentés qu'à un seul endroit : les
OpenAPI des deux APIs (`/api-doc`, `/api-doc-usagers`). Aucun document Markdown ne les reliste.
