/**
 * Catalogue des variables utilisables dans les documents (`document_templates`).
 * Schéma **possédé**, sans dépendance : c'est un **contrat de nommage** que le
 * Socle publie et qu'une application de la gamme remplit au moment de produire
 * la pièce. Le Socle ne fusionne rien et n'inspecte pas les fichiers.
 *
 * ⚠️ Toutes ces variables n'ont pas de source de données dans le Socle : les
 * composantes d'adresse (numéro, BTQ, voie…) manquent au référentiel `contacts`,
 * et toute la famille `demande.*` vit dans les applications aval. Le catalogue
 * dit comment nommer, pas ce que le Socle sait valoriser.
 * **`organisme.*` fait exception** : le Socle en est la source de vérité
 * (colonnes d'`organizations`, charte résolue par `resolve_branding`).
 *
 * Syntaxe retenue : moustaches préfixées par le domaine — `{{usager.nom}}` —
 * celle des moteurs de fusion courants (docxtemplater, carbone.io), qui gèrent
 * nativement les boucles dont la liste des pièces a besoin.
 */

/** Une variable simple : un jeton à recopier, un titre pour l'agent. */
export interface DocumentVariable {
  /** Clé sans les accolades, préfixée par son domaine (`usager.nom`). */
  key: string;
  /** Titre affiché dans la liste des variables. */
  title: string;
  /** Précision facultative, quand le titre seul prête à confusion. */
  hint?: string;
}

/**
 * Une **liste** répétée dans le document (les pièces d'une demande, par
 * exemple) : ses variables ne valent qu'entre les balises d'ouverture et de
 * fermeture, et leurs clés y sont relatives.
 */
export interface DocumentVariableLoop {
  /** Clé de la liste (`demande.pieces`). */
  key: string;
  title: string;
  hint?: string;
  /** Variables disponibles à l'intérieur de la boucle, clés relatives. */
  variables: DocumentVariable[];
  /** Extrait complet, prêt à recopier tel quel. */
  sample: string;
}

/** Un domaine de variables (l'organisme, l'usager, la demande). */
export interface DocumentVariableGroup {
  key: "usager" | "demande" | "organisme";
  title: string;
  description: string;
  variables: DocumentVariable[];
  loops?: DocumentVariableLoop[];
}

/** Encadre une clé des moustaches attendues dans le fichier. */
export function variableToken(key: string): string {
  return `{{${key}}}`;
}

const USAGER: DocumentVariableGroup = {
  key: "usager",
  title: "Usager",
  description: "L'identité et les coordonnées de la personne ou de la structure.",
  variables: [
    { key: "usager.nom", title: "Nom" },
    { key: "usager.prenom", title: "Prénom" },
    { key: "usager.civilite", title: "Civilité", hint: "Madame, Monsieur" },
    {
      key: "usager.adresse_complete",
      title: "Adresse complète",
      hint: "Le bloc adresse d'un seul tenant, sauts de ligne compris",
    },
    { key: "usager.numero", title: "Numéro" },
    { key: "usager.btq", title: "Bis / Ter / Quater" },
    { key: "usager.voie", title: "Voie" },
    { key: "usager.complement", title: "Complément d'adresse" },
    { key: "usager.appartement", title: "Appartement" },
    { key: "usager.batiment", title: "Bâtiment" },
    { key: "usager.code_postal", title: "Code postal" },
    { key: "usager.ville", title: "Ville" },
    { key: "usager.telephone_mobile", title: "Numéro de téléphone", hint: "Mobile" },
    { key: "usager.courriel", title: "Adresse courriel" },
    { key: "usager.quartier", title: "Quartier" },
    { key: "usager.telephone_fixe", title: "Téléphone fixe" },
  ],
};

const DEMANDE: DocumentVariableGroup = {
  key: "demande",
  title: "Demande",
  description: "Le dossier en cours : sa démarche, son avancement, son instructeur.",
  variables: [
    { key: "demande.libelle_demarche", title: "Libellé de la démarche" },
    { key: "demande.code_suivi", title: "Code de suivi" },
    { key: "demande.categorie", title: "Catégorie" },
    { key: "demande.organisme_responsable", title: "Organisme responsable" },
    { key: "demande.date_depot", title: "Date de dépôt" },
    { key: "demande.date_echeance", title: "Date d'échéance" },
    { key: "demande.urgence", title: "Urgence" },
    { key: "demande.etat_actuel", title: "État actuel" },
    { key: "demande.date_cloture", title: "Date de clôture" },
    {
      key: "demande.etat_cloture",
      title: "État à la clôture",
      hint: "Positive ou négative",
    },
    { key: "demande.agent_nom", title: "Agent instructeur — nom" },
    { key: "demande.agent_prenom", title: "Agent instructeur — prénom" },
    { key: "demande.agent_courriel", title: "Agent instructeur — courriel" },
  ],
  loops: [
    {
      key: "demande.pieces",
      title: "Pièces de la demande",
      hint:
        "Une liste : le bloc est répété autant de fois que le dossier compte de pièces. " +
        "À l'intérieur, les clés sont relatives.",
      variables: [
        { key: "libelle", title: "Libellé de la pièce" },
        { key: "statut", title: "Statut de la pièce" },
      ],
      sample: "{{#demande.pieces}}\n{{libelle}} : {{statut}}\n{{/demande.pieces}}",
    },
  ],
};

/**
 * L'organisme émetteur. ⚠️ **Seul groupe dont le Socle est la source de
 * vérité** : les quatre premières viennent des colonnes d'`organizations`, la
 * charte de `resolve_branding` — donc **héritage appliqué**. Une
 * sous-organisation qui hérite a ses colonnes de charte nulles : c'est la
 * charte *applicable* qui est attendue ici, jamais la valeur brute.
 */
const ORGANISME: DocumentVariableGroup = {
  key: "organisme",
  title: "Organisme",
  description:
    "La collectivité émettrice : ses coordonnées et sa charte graphique (héritage appliqué).",
  variables: [
    { key: "organisme.nom", title: "Nom" },
    { key: "organisme.adresse", title: "Adresse" },
    { key: "organisme.telephone", title: "Téléphone" },
    { key: "organisme.courriel", title: "Adresse courriel" },
    {
      key: "organisme.logo_url",
      title: "Logo (couleur)",
      hint: "URL de l'image — à insérer comme image, pas à coller comme texte",
    },
    {
      key: "organisme.logo_blanc_url",
      title: "Logo blanc",
      hint: "Variante pour fonds sombres — URL de l'image",
    },
    {
      key: "organisme.couleur_principale",
      title: "Couleur principale",
      hint: "Hexadécimal #rrggbb",
    },
    {
      key: "organisme.couleur_secondaire",
      title: "Couleur secondaire",
      hint: "Hexadécimal #rrggbb",
    },
  ],
};

/** Le catalogue complet, dans l'ordre d'affichage. */
export const DOCUMENT_VARIABLE_GROUPS: readonly DocumentVariableGroup[] = [
  USAGER,
  DEMANDE,
  ORGANISME,
];

/** Toutes les clés du catalogue, boucles et clés relatives comprises. */
export function allVariableKeys(): string[] {
  const keys: string[] = [];
  for (const group of DOCUMENT_VARIABLE_GROUPS) {
    for (const v of group.variables) keys.push(v.key);
    for (const loop of group.loops ?? []) {
      keys.push(loop.key);
      for (const v of loop.variables) keys.push(`${loop.key}.${v.key}`);
    }
  }
  return keys;
}
