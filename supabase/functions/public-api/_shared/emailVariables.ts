/**
 * Catalogue UNIQUE des variables des modèles de courriels de la gamme.
 *
 * ⚠️ Ce fichier existe en DEUX copies BYTE-IDENTIQUES :
 *   - `src/features/email-templates/emailVariables.ts` (l'écran) ;
 *   - `supabase/functions/public-api/_shared/emailVariables.ts` (l'API, qui le
 *     publie sur `GET /v1/email-templates/variables`).
 * Et il a un JUMEAU EN BASE : `public.email_template_common_variables()`, qui
 * REFUSE une variable inconnue (trigger `trg_guard_email_template_variables`).
 * Des tests comparent les trois.
 *
 * Contrat de NOMMAGE (décision du 2026-11-12) : les clés sont celles d'Iris, qui
 * les remplit (`TEMPLATE_VARIABLES` d'Iris), plus deux familles :
 *  • `EMAIL_COMMON_VARIABLES` — disponibles sur toute demande, donc dans TOUT
 *    modèle (y compris un modèle créé par la collectivité) ;
 *  • `EMAIL_CONTEXT_VARIABLES` — fournies seulement par l'événement d'un
 *    courriel système (le lien de suivi, le code d'accès, l'extrait d'un
 *    message…) : utilisables dans les seuls courriels système qui les déclarent
 *    (`email_template_defaults.variables`).
 * Le Socle ne remplit rien : l'application qui envoie le fait.
 *
 * Partie conditionnelle : `{{#cle}}…{{/cle}}` n'est rendue que si la variable a
 * une valeur.
 *
 * ⚠️ Ne pas confondre avec `documentVariables.ts` (modèles de DOCUMENTS Word,
 * fusionnés par Clara) : autre contrat, autres noms.
 */

export interface EmailVariable {
  /** Clé sans les accolades : `usager.nom`. */
  key: string;
  label: string;
  /** Valeur d'exemple pour un aperçu — jamais une vraie donnée. */
  sample: string;
  hint?: string;
}

export interface EmailVariableGroup {
  key: string;
  title: string;
  description: string;
  variables: EmailVariable[];
}

export const EMAIL_COMMON_VARIABLE_GROUPS: readonly EmailVariableGroup[] = [
  {
    key: "usager",
    title: "Usager",
    description: "L'identité retenue au dépôt de la demande.",
    variables: [
      {
        key: "usager.salutation",
        label: "Formule d'appel",
        sample: "Madame Marie Durand",
        hint: "« Madame Marie Durand », à défaut « Madame, Monsieur »",
      },
      { key: "usager.civilite", label: "Civilité", sample: "Madame" },
      { key: "usager.prenom", label: "Prénom", sample: "Marie" },
      { key: "usager.nom", label: "Nom", sample: "Durand" },
      {
        key: "usager.nom_complet",
        label: "Nom complet",
        sample: "Marie Durand",
        hint: "Prénom et nom, ou la raison sociale pour une entreprise",
      },
      { key: "usager.raison_sociale", label: "Raison sociale", sample: "Boulangerie Durand" },
      { key: "usager.courriel", label: "Courriel", sample: "marie.durand@exemple.fr" },
      { key: "usager.telephone", label: "Téléphone", sample: "06 41 22 87 03" },
      { key: "usager.adresse", label: "Adresse", sample: "12 rue des Lilas, 44210 Saint-Aubin" },
    ],
  },
  {
    key: "demande",
    title: "Demande",
    description: "Le dossier : sa démarche, son avancement, ses dates.",
    variables: [
      { key: "demande.reference", label: "Référence", sample: "DEM-2026-000042" },
      { key: "demande.objet", label: "Objet", sample: "Nid-de-poule rue des Lilas" },
      {
        key: "demande.description",
        label: "Description",
        sample: "Un affaissement s'est formé devant le numéro 12.",
      },
      { key: "demande.statut", label: "Statut", sample: "En cours d'instruction" },
      { key: "demande.priorite", label: "Priorité", sample: "Normale" },
      {
        key: "demande.demarche",
        label: "Démarche",
        sample: "Signalement de voirie",
        hint: "La démarche du Socle dont la demande est issue",
      },
      { key: "demande.categorie", label: "Catégorie", sample: "Cadre de vie" },
      {
        key: "demande.destinataire",
        label: "Organisme destinataire",
        sample: "Direction de la voirie",
      },
      { key: "demande.canal", label: "Canal de dépôt", sample: "Guichet" },
      { key: "demande.date_depot", label: "Date de dépôt", sample: "21 août 2026" },
      {
        key: "demande.date_instruction",
        label: "Date de prise en charge",
        sample: "22 août 2026",
        hint: "Premier passage au statut « En cours d'instruction »",
      },
      { key: "demande.date_cloture", label: "Date de clôture", sample: "28 août 2026" },
      { key: "demande.date_echeance", label: "Date d'échéance", sample: "4 septembre 2026" },
      { key: "demande.motif_cloture", label: "Motif de clôture", sample: "Irrecevable" },
    ],
  },
  {
    key: "agent",
    title: "Agent",
    description: "Qui traite la demande.",
    variables: [{ key: "agent.nom", label: "Agent en charge", sample: "Camille Martin" }],
  },
  {
    key: "organisation",
    title: "Organisation",
    description: "Pour qui : la collectivité.",
    variables: [{ key: "organisation.nom", label: "Collectivité", sample: "Ville de Saint-Aubin" }],
  },
];

/**
 * Variables fournies par l'événement d'un courriel système — seulement là où
 * ce courriel les déclare.
 */
export const EMAIL_CONTEXT_VARIABLE_GROUP: EmailVariableGroup = {
  key: "evenement",
  title: "Courriels automatiques",
  description:
    "Fournies par l'événement qui déclenche un courriel système, et seulement dans les courriels qui les citent.",
  variables: [
    {
      key: "demande.statut_usager",
      label: "Statut lu par l'usager",
      sample: "En cours de traitement",
      hint: "« En cours de traitement », « En attente de votre réponse »…",
    },
    {
      key: "demande.lien",
      label: "Lien vers la demande",
      sample: "https://demarches.saint-aubin.fr/suivi",
      hint: "Espace usager ou page de suivi",
    },
    {
      key: "demande.code_acces",
      label: "Code d'accès",
      sample: "7K4-PQ2",
      hint: "Vide si le suivi en ligne n'a pas été demandé",
    },
    {
      key: "demande.commentaire_cloture",
      label: "Commentaire de clôture",
      sample: "Les travaux ont été réalisés le 27 août.",
      hint: "Saisi par l'agent à la clôture — facultatif",
    },
    {
      key: "message.extrait",
      label: "Extrait du message",
      sample: "Bonjour, pourriez-vous nous transmettre…",
      hint: "Les premiers caractères du message de l'agent",
    },
    { key: "message.nombre", label: "Nombre de nouveaux messages", sample: "2" },
  ],
};

/** Les clés communes, dans l'ordre du catalogue — jumelles de la fonction SQL. */
export const EMAIL_COMMON_VARIABLES: readonly string[] = EMAIL_COMMON_VARIABLE_GROUPS.flatMap(
  (group) => group.variables.map((variable) => variable.key),
);

/** Toutes les clés connues, communes puis propres aux courriels système. */
export function allEmailVariableKeys(): string[] {
  return [
    ...EMAIL_COMMON_VARIABLES,
    ...EMAIL_CONTEXT_VARIABLE_GROUP.variables.map((variable) => variable.key),
  ];
}

/** Ce qu'un texte peut citer : les communes, plus celles du courriel système. */
export function allowedEmailVariables(systemVariables: readonly string[] = []): string[] {
  return Array.from(new Set([...EMAIL_COMMON_VARIABLES, ...systemVariables]));
}

/** Le libellé d'une variable, pour l'afficher à côté de son jeton. */
export function emailVariableLabel(key: string): string | null {
  for (const group of [...EMAIL_COMMON_VARIABLE_GROUPS, EMAIL_CONTEXT_VARIABLE_GROUP]) {
    const found = group.variables.find((variable) => variable.key === key);
    if (found) return found.label;
  }
  return null;
}
