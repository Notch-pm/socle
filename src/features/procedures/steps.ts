export interface StepDef {
  key: string;
  label: string;
}

/** Les 5 étapes du paramétrage d'une démarche — toutes fonctionnelles, chacune
 *  persistée dans sa propre colonne de `procedures`. */
export const PROCEDURE_STEPS: readonly StepDef[] = [
  { key: "descriptif", label: "Descriptif" },
  { key: "demandeur", label: "Informations demandeur" },
  { key: "formulaire", label: "Formulaire" },
  { key: "communication", label: "Communication" },
  { key: "connaissances", label: "Base de connaissances" },
] as const;
