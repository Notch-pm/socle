/**
 * Les applications de la gamme, telles qu'un agent les voit depuis n'importe
 * laquelle d'entre elles : de quoi nommer le produit courant et se rendre chez
 * le voisin sans quitter sa collectivité.
 *
 * ⚠️ **CATALOGUE FIGÉ DANS LE CODE**, motif `languages.ts` /
 * `documentVariables.ts` : c'est un contrat de nommage, pas une donnée de
 * client. La `key` **EST** le sous-domaine (`iris` ⇒ `https://iris.edilumen.fr`)
 * — les quatre applications sont déployées sur le même schéma d'URL, et c'est
 * cette régularité qui permet de ne rien paramétrer par collectivité. Ajouter
 * une application, c'est ajouter une entrée ici.
 *
 * ⚠️ **NE PAS CONFONDRE avec la table `applications`** (registre des
 * consommateurs d'API : `nora`, `iris`, `clara`, `socle` — voir la feature
 * « Applications et abonnements »). Celle-là dit qui a le droit d'appeler le
 * Socle ; celle-ci dit où un **agent** peut se rendre. Les deux listes se
 * recoupent sans se confondre : **Nora** est le portail des **usagers**, elle
 * n'a rien à faire dans un lanceur d'agent ; **Ariane** n'appelle pas encore
 * l'API mais s'ouvre bel et bien depuis ici.
 */

export interface SuiteApp {
  /** Sous-domaine **et** identifiant. Minuscule, label DNS. */
  key: string;
  /** Le nom du produit, tel qu'il s'écrit à l'écran. */
  name: string;
  /** Ce que l'application fait, en trois mots — pour choisir sans se tromper. */
  tagline: string;
}

/** Le domaine de la gamme. Les quatre produits y sont des sous-domaines. */
export const SUITE_DOMAIN = "edilumen.fr";

const SOCLE: SuiteApp = {
  key: "socle",
  name: "Socle",
  tagline: "Organisations et paramétrage",
};

const IRIS: SuiteApp = {
  key: "iris",
  name: "Iris",
  tagline: "Gestion des demandes",
};

const CLARA: SuiteApp = {
  key: "clara",
  name: "Clara",
  tagline: "Gestion du courrier",
};

const ARIANE: SuiteApp = {
  key: "ariane",
  name: "Ariane",
  tagline: "Gestion de file d'attente",
};

/** Dans l'ordre où le lanceur les propose. */
export const SUITE_APPS: readonly SuiteApp[] = [SOCLE, IRIS, CLARA, ARIANE];

/**
 * Cette application-ci. Une constante, pas une recherche dans le catalogue :
 * ce dépôt **est** le Socle, la question ne se pose pas à l'exécution.
 */
export const CURRENT_APP: SuiteApp = SOCLE;

/** `https://<clé>.<domaine>` — le schéma est le même pour les quatre. */
export function appUrl(app: SuiteApp): string {
  return `https://${app.key}.${SUITE_DOMAIN}`;
}

/**
 * L'initiale de la pastille, **dérivée** du nom : une lettre saisie à part
 * finirait par démentir le nom qu'elle abrège.
 */
export function appInitial(app: SuiteApp): string {
  return app.name.slice(0, 1).toUpperCase();
}
