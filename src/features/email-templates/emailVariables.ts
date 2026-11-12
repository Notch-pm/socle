/**
 * Catalogue des variables utilisables dans les modèles de courriels.
 *
 * Contrat de NOMMAGE, comme `documentVariables.ts` dont il reprend les trois
 * domaines (`usager.*`, `demande.*`, `organisme.*`) : le Socle publie les noms,
 * l'application qui envoie les remplit. Il y ajoute ce dont un courriel a
 * besoin et qu'un document n'a pas : la formule d'appel, la référence et le
 * lien de la demande, le code d'accès, le statut tel que l'usager le lit, le
 * commentaire de clôture, l'extrait d'un message.
 *
 * Partie conditionnelle : `{{#demande.code_acces}}…{{/demande.code_acces}}`
 * n'est rendue que si la variable a une valeur (syntaxe des moustaches, celle
 * de la boucle `demande.pieces`).
 */
import {
  DOCUMENT_VARIABLE_GROUPS,
  type DocumentVariable,
  type DocumentVariableLoop,
} from "@/features/documents/documentVariables";

export interface EmailVariableGroup {
  key: string;
  title: string;
  description: string;
  variables: DocumentVariable[];
  loops?: DocumentVariableLoop[];
}

/** Variables propres aux courriels, ajoutées au domaine correspondant. */
const EMAIL_ONLY: Record<string, DocumentVariable[]> = {
  usager: [
    {
      key: "usager.salutation",
      title: "Formule d'appel",
      hint: "« Madame Marie Durand », à défaut « Madame, Monsieur »",
    },
  ],
  demande: [
    { key: "demande.reference", title: "Référence de la demande" },
    { key: "demande.objet", title: "Objet de la demande", hint: "Tel que saisi au dépôt" },
    { key: "demande.lien", title: "Lien vers la demande", hint: "Espace usager ou page de suivi" },
    {
      key: "demande.code_acces",
      title: "Code d'accès",
      hint: "Pour le suivi en ligne sans compte — vide s'il n'a pas été demandé",
    },
    {
      key: "demande.statut_usager",
      title: "Statut lu par l'usager",
      hint: "« En cours de traitement », « En attente de votre réponse »…",
    },
    {
      key: "demande.commentaire_cloture",
      title: "Commentaire de clôture",
      hint: "Saisi par l'agent à la clôture — facultatif",
    },
  ],
};

const MESSAGE: EmailVariableGroup = {
  key: "message",
  title: "Message",
  description: "Le message de l'agent annoncé par le courriel.",
  variables: [
    { key: "message.extrait", title: "Extrait du message", hint: "Les premiers caractères" },
    { key: "message.nombre", title: "Nombre de nouveaux messages" },
  ],
};

/** Le catalogue complet des courriels, dans l'ordre d'affichage. */
export const EMAIL_VARIABLE_GROUPS: readonly EmailVariableGroup[] = (() => {
  const groups: EmailVariableGroup[] = DOCUMENT_VARIABLE_GROUPS.map((group) => ({
    ...group,
    variables: [...(EMAIL_ONLY[group.key] ?? []), ...group.variables],
  }));
  // Le message se range après la demande, avant l'organisme.
  const demandeIndex = groups.findIndex((group) => group.key === "demande");
  groups.splice(demandeIndex + 1, 0, MESSAGE);
  return groups;
})();

/** Toutes les clés du catalogue des courriels, boucles et clés relatives comprises. */
export function allEmailVariableKeys(): string[] {
  const keys: string[] = [];
  for (const group of EMAIL_VARIABLE_GROUPS) {
    for (const v of group.variables) keys.push(v.key);
    for (const loop of group.loops ?? []) {
      keys.push(loop.key);
      for (const v of loop.variables) keys.push(`${loop.key}.${v.key}`, v.key);
    }
  }
  return keys;
}

/** Le titre d'une variable, pour l'afficher à côté de son jeton. */
export function emailVariableTitle(key: string): string | null {
  for (const group of EMAIL_VARIABLE_GROUPS) {
    const found = group.variables.find((v) => v.key === key);
    if (found) return found.title;
  }
  return null;
}
