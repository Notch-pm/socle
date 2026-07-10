export interface StepDef {
  key: string;
  label: string;
}

/** Les 5 étapes du paramétrage d'une démarche. « Descriptif » et « Informations demandeur »
 *  sont fonctionnelles ; les autres sont des placeholders. */
export const PROCEDURE_STEPS: readonly StepDef[] = [
  { key: "descriptif", label: "Descriptif" },
  { key: "demandeur", label: "Informations demandeur" },
  { key: "formulaire", label: "Formulaire" },
  { key: "communication", label: "Communication" },
  { key: "connaissances", label: "Base de connaissances" },
] as const;
