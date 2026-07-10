export interface StepDef {
  key: string;
  label: string;
}

/** Les 6 étapes du paramétrage d'une démarche. Seule « Descriptif » est active pour l'instant. */
export const PROCEDURE_STEPS: readonly StepDef[] = [
  { key: "descriptif", label: "Descriptif" },
  { key: "publication", label: "Publication" },
  { key: "demandeur", label: "Informations demandeur" },
  { key: "formulaire", label: "Formulaire" },
  { key: "communication", label: "Communication" },
  { key: "connaissances", label: "Base de connaissances" },
] as const;
