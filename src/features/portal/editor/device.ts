/**
 * L'appareil prévisualisé dans le canevas — pas une donnée de la page, un
 * réglage d'affichage de l'éditeur (comme la sélection ou la palette).
 */
export type Device = "bureau" | "tablette" | "mobile";

export const DEVICE_OPTIONS: { value: Device; label: string }[] = [
  { value: "bureau", label: "Bureau" },
  { value: "tablette", label: "Tablette" },
  { value: "mobile", label: "Mobile" },
];

/** Largeur de page simulée par appareil (maquette). */
export const DEVICE_PAGE_WIDTH: Record<Device, number> = {
  bureau: 900,
  tablette: 768,
  mobile: 390,
};

/**
 * Colonnes effectives d'une grille selon l'appareil : une seule sur mobile,
 * deux au plus sur tablette — la valeur choisie dans l'inspecteur reste
 * intacte, seul l'aperçu se contraint.
 */
export function effectiveColumns(columns: number, device: Device): number {
  if (device === "mobile") return 1;
  if (device === "tablette") return Math.min(columns, 2);
  return columns;
}
