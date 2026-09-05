import {
  createContactSection,
  createSection,
  type ContactSource,
  type PaletteKind,
  type PortalSection,
} from "@/features/portal/portalPage";

/**
 * Fabrique la section correspondant à un item de palette. Point unique
 * (clic dans `SectionPalette`, dépôt géré par `PortalEditor`) : les deux
 * chemins doivent produire exactement la même section.
 */
export function sectionFromPaletteKind(kind: PaletteKind, contact: ContactSource): PortalSection {
  return kind === "contact" ? createContactSection(contact) : createSection(kind);
}
