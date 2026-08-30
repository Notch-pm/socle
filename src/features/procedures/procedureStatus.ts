/**
 * Cycle de vie du paramétrage d'une démarche : **brouillon** tant que la
 * configuration s'écrit, **production** quand elle est déclarée prête. Logique
 * pure (aucune dépendance React/Supabase), persistée dans `procedures.status`.
 *
 * ⚠️ À ne pas confondre avec le bloc `visibility` de `communication.ts` :
 * `status` dit si la configuration est **finie**, `visibility` dit **où et
 * quand** proposer une démarche déjà prête. Une démarche en production peut
 * n'être sur aucun portail (démarche interne) ; une démarche en brouillon
 * n'est nulle part.
 */

export type ProcedureStatus = "brouillon" | "production";

/** État d'une démarche qu'on vient de créer : rien n'a encore été déclaré prêt. */
export const DEFAULT_PROCEDURE_STATUS: ProcedureStatus = "brouillon";

export const PROCEDURE_STATUS_LABELS: Record<ProcedureStatus, string> = {
  brouillon: "Brouillon",
  production: "Production",
};

/**
 * Statut lisible depuis une colonne texte (le CHECK en base le garantit, mais
 * la colonne reste un `text` côté types générés). Toute valeur inattendue
 * retombe sur **brouillon** : le doute ne met rien en production.
 */
export function parseProcedureStatus(raw: unknown): ProcedureStatus {
  return raw === "production" ? "production" : DEFAULT_PROCEDURE_STATUS;
}

/** La démarche est-elle encore en cours d'écriture ? (elle porte alors le tag « Brouillon ») */
export function isDraftProcedure(raw: unknown): boolean {
  return parseProcedureStatus(raw) === "brouillon";
}

/** Statut correspondant à la position du commutateur « Production » d'une liste. */
export function statusFromProductionToggle(enabled: boolean): ProcedureStatus {
  return enabled ? "production" : "brouillon";
}
