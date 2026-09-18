export interface StepDef {
  key: string;
  label: string;
}

/**
 * Les 6 étapes du paramétrage d'une démarche — toutes fonctionnelles, chacune
 * persistée dans sa propre colonne de `procedures`.
 *
 * ⚠️ LA CLÉ SUIT LA COLONNE, LE LIBELLÉ SUIT L'AGENT. Deux d'entre eux ne
 * coïncident plus depuis le 2026-09-18 : la clé `communication` porte le libellé
 * « Publication » (colonne `communication_config` — où et quand la démarche est
 * proposée, et ce que l'agent produit), et la clé `usager` porte
 * « Communication usager » (colonne `user_communication` — ce que l'usager lit).
 * Renommer la clé aurait fait perdre le fil vers la colonne ; garder l'ancien
 * libellé aurait donné deux entrées « Communication » côte à côte dans le
 * stepper. La correspondance complète est dans docs/features/demarches.md.
 */
export const PROCEDURE_STEPS: readonly StepDef[] = [
  { key: "descriptif", label: "Descriptif" },
  { key: "demandeur", label: "Informations demandeur" },
  { key: "formulaire", label: "Formulaire" },
  { key: "usager", label: "Communication usager" },
  { key: "communication", label: "Publication" },
  { key: "connaissances", label: "Base de connaissances" },
] as const;
