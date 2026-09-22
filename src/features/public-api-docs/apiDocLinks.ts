import { BookOpen, BookUser } from "lucide-react";

/**
 * Les documentations d'API que le Socle publie, telles qu'un agent les trouve
 * depuis les menus de l'application.
 *
 * ⚠️ **CATALOGUE FIGÉ DANS LE CODE**, motif `suiteApps.ts` / `languages.ts` :
 * ces routes sont celles déclarées dans `App.tsx` (`/api-doc`,
 * `/api-doc-usagers`), **publiques** — elles s'ouvrent sans compte, et c'est
 * précisément pourquoi on peut les pointer en `target="_blank"` sans se
 * demander qui regarde. Ajouter une documentation au menu, c'est ajouter une
 * entrée ici : les deux menus (rail de l'app, menu latéral du superadmin) lisent
 * cette liste, ils ne tiennent pas chacun la leur.
 *
 * ⚠️ **Le contrat `ai-api` (`/api-doc-ia`) n'y figure pas** : le guichet IA
 * n'est ouvert qu'aux applications de la gamme, une collectivité n'a pas de clé
 * à y brancher. Sa page existe et reste accessible par son URL.
 *
 * Vocabulaire : « usagers », jamais « citoyens » — c'est le mot du référentiel
 * (`contacts`) et du portail, et deux mots pour une même chose finissent par
 * désigner deux choses.
 */
export interface ApiDocLink {
  /** Route **publique** de l'app qui rend le contrat (Redoc). */
  path: string;
  /** Le nom de l'API, tel qu'il s'écrit dans un menu. */
  label: string;
  /** Ce que l'API sert, en quelques mots — pour choisir sans se tromper. */
  tagline: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const API_DOC_LINKS: readonly ApiDocLink[] = [
  {
    path: "/api-doc",
    label: "API Référentiel",
    tagline: "organisations, démarches et portail, en lecture seule",
    icon: BookOpen,
  },
  {
    path: "/api-doc-usagers",
    label: "API Usagers",
    tagline: "le référentiel des usagers, en lecture et en écriture",
    icon: BookUser,
  },
];

/**
 * Le libellé accessible d'un lien de documentation — l'infobulle du rail **et**
 * le nom accessible des deux menus, pour que les deux disent la même chose.
 *
 * Il **annonce le nouvel onglet** : un lien qui change de fenêtre sans le dire
 * est une surprise (WCAG 3.2.5), et dans un rail d'icônes l'intitulé est le
 * seul endroit où prévenir. Il porte aussi le `tagline`, parce qu'au survol
 * d'une icône seule « API Référentiel » ne dit pas encore de quoi il s'agit.
 */
export function apiDocLinkTitle(link: ApiDocLink): string {
  return `Documentation ${link.label} — ${link.tagline} (nouvel onglet)`;
}
