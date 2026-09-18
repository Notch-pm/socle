/**
 * Les CONTENUS du site de démarches — les pages de texte qu'une collectivité
 * écrit pour son portail, à côté de la page d'accueil composée. Onglet
 * « Contenus » de l'éditeur ; persistés dans `portal_contents.draft` /
 * `.published`, un par `slug`.
 *
 * Schéma **possédé**, contrat public consommé en aval (`GET /v1/portal/content`)
 * — même discipline que la composition et le thème : sauvegarder n'est pas
 * publier, et « Publier » publie le site entier (composition, thème, contenus).
 *
 * ⚠️ **Un contenu est UN TEXTE, pas une composition.** `{ body }` en Markdown —
 * la même syntaxe que le descriptif usager d'une démarche. Une page composée de
 * blocs est une `portal_pages` ; les deux ne partagent ni table ni parseur.
 *
 * ⚠️ **Le catalogue des contenus vit ICI, pas en base** (motif `languages.ts`) :
 * la table valide la forme d'un slug, pas la liste. Un contenu de plus
 * (mentions légales…) est une entrée de `PORTAL_CONTENTS`, une route chez Nora
 * et une entrée au changelog — pas une migration.
 *
 * ⚠️ **Pas de `version`, comme le thème** : le schéma tient en une clé, et un
 * littéral de version ferait retomber tout le contenu sur son défaut — c'est-à-
 * dire effacerait une déclaration — au premier numéro inattendu. L'évolution se
 * fait en clés voisines.
 */

/** Les contenus que le site peut porter. L'ordre est celui de l'onglet. */
export const PORTAL_CONTENTS = [
  {
    slug: "accessibilite",
    label: "Déclaration d'accessibilité",
    tag: "RGAA",
    /** L'adresse de la page sur le site de démarches (servie par Nora). */
    path: "/accessibilite",
  },
] as const;

export type PortalContentSlug = (typeof PORTAL_CONTENTS)[number]["slug"];

export const ACCESSIBILITY_STATEMENT_SLUG: PortalContentSlug = "accessibilite";

/**
 * Une déclaration d'accessibilité complète tient en quelques milliers de
 * caractères ; la borne est large, elle ne sert qu'à refuser l'absurde (la
 * base porte un garde-fou du même ordre sur la ligne entière).
 */
export const MAX_CONTENT_BODY_LENGTH = 50_000;

export interface PortalContent {
  /** Le texte, en Markdown. Vide = rien d'écrit. */
  body: string;
}

export function defaultPortalContent(): PortalContent {
  return { body: "" };
}

/**
 * Lecture tolérante. Ce qui n'est pas un objet, ou un texte démesuré, rend un
 * contenu vide — plutôt qu'un texte tronqué au milieu d'une phrase, qui
 * publierait une déclaration que personne n'a écrite ainsi.
 */
export function parsePortalContent(raw: unknown): PortalContent {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultPortalContent();
  const body = (raw as Record<string, unknown>).body;
  return {
    body: typeof body === "string" && body.length <= MAX_CONTENT_BODY_LENGTH ? body : "",
  };
}

/** Le contenu a-t-il quelque chose à montrer ? Des blancs ne sont pas un texte. */
export function hasContentBody(content: PortalContent): boolean {
  return content.body.trim() !== "";
}

export interface StatementTemplateSource {
  name: string;
  email: string | null;
  address: string | null;
}

/**
 * Le modèle de déclaration d'accessibilité — la structure du modèle de la
 * DINUM (RGAA 4.1.2), pré-rempli avec ce que le Socle sait de la collectivité.
 *
 * ⚠️ **Tout ce qui est entre crochets reste à écrire**, et c'est voulu : l'état
 * de conformité, le taux, la date et l'auteur de l'audit sont des AFFIRMATIONS
 * engageantes. Le modèle donne la structure, jamais le résultat — pré-remplir
 * « partiellement conforme » ferait publier au nom de la collectivité une
 * déclaration qu'elle n'a pas faite.
 *
 * Les titres commencent à `#` : sur le site, la page porte déjà son propre
 * titre de premier niveau (« Déclaration d'accessibilité »), et Nora descend
 * chaque niveau d'un cran.
 */
export function accessibilityStatementTemplate(source: StatementTemplateSource): string {
  const name = source.name.trim() || "[nom de la collectivité]";
  const email = source.email?.trim() || "[adresse électronique]";
  const address = source.address?.trim().replace(/\s*\n\s*/g, ", ") || "[adresse postale]";
  return `${name} s'engage à rendre son site de démarches en ligne accessible, conformément à l'article 47 de la loi n° 2005-102 du 11 février 2005.

À cette fin, elle met en œuvre la stratégie et les actions suivantes : [schéma pluriannuel de mise en accessibilité, plan d'actions de l'année en cours].

Cette déclaration d'accessibilité s'applique au site de démarches en ligne de ${name}.

# État de conformité

Le site de démarches en ligne de ${name} est **[totalement / partiellement / non] conforme** avec le référentiel général d'amélioration de l'accessibilité (RGAA), version 4.1.2[, en raison des non-conformités et des dérogations énumérées ci-dessous].

# Résultats des tests

L'audit de conformité réalisé par [nom de la personne ou de l'organisme] révèle que :

- [X] % des critères du RGAA version 4.1.2 sont respectés ;
- le taux moyen de conformité du site s'élève à [X] %.

# Contenus non accessibles

## Non-conformités

- [Critères non respectés, et contenus concernés]

## Dérogations pour charge disproportionnée

- [Contenus concernés, et alternative proposée]

## Contenus non soumis à l'obligation d'accessibilité

- [Par exemple : documents bureautiques publiés avant le 23 septembre 2018, contenus de tiers]

# Établissement de cette déclaration d'accessibilité

Cette déclaration a été établie le [date].

## Technologies utilisées pour la réalisation du site

- HTML5
- CSS
- JavaScript

## Environnement de test

[Combinaisons de navigateurs et de technologies d'assistance utilisées pour l'audit]

## Outils pour évaluer l'accessibilité

- [Outils utilisés]

## Pages du site ayant fait l'objet de la vérification de conformité

- Accueil
- [Présentation d'une démarche]
- [Formulaire d'une démarche]
- Déclaration d'accessibilité

# Retour d'information et contact

Si vous n'arrivez pas à accéder à un contenu ou à un service, vous pouvez contacter ${name} pour être orienté vers une alternative accessible ou obtenir le contenu sous une autre forme :

- par courriel : ${email} ;
- par courrier : ${address}.

# Voies de recours

Si vous constatez un défaut d'accessibilité vous empêchant d'accéder à un contenu ou à une fonctionnalité du site, que vous nous le signalez et que vous ne parvenez pas à obtenir de réponse de notre part, vous êtes en droit de faire parvenir vos doléances ou une demande de saisine au Défenseur des droits.

Plusieurs moyens sont à votre disposition :

- écrire un message au Défenseur des droits, par le [formulaire en ligne](https://formulaire.defenseurdesdroits.fr/) ;
- contacter le délégué du Défenseur des droits dans votre région ([liste des délégués](https://www.defenseurdesdroits.fr/saisir/delegues)) ;
- envoyer un courrier par la poste (gratuit, ne pas mettre de timbre) : Défenseur des droits, Libre réponse 71120, 75342 Paris CEDEX 07.
`;
}
