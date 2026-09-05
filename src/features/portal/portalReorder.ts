/**
 * Logique pure de composition d'une page du portail : insertion, déplacement,
 * remplacement et retrait de sections. Calqué sur `formReorder.ts`, en plus
 * simple — une page est une liste plate, sans imbrication.
 *
 * Aucune dépendance dnd-kit : le composant traduit les événements en appels
 * ici, et c'est ce qui rend le réordonnancement testable.
 */
import type { PortalSection } from "./portalPage";

/** Côté d'insertion par rapport à la cible survolée. */
export type DropPosition = "before" | "after";

/** Boîte englobante, telle que dnd-kit la fournit (`rect.top`, `rect.height`). */
export interface Box {
  top: number;
  height: number;
}

/**
 * Avant ou après la cible ? Décidé par la géométrie — le centre de l'élément
 * déplacé est-il passé sous le centre de la cible — comme `FormulaireStep`.
 * Sans boîte connue, « avant » : c'est le choix qui ne saute rien.
 */
export function resolveDropPosition(active: Box | null, over: Box | null): DropPosition {
  if (!active || !over) return "before";
  const activeCenter = active.top + active.height / 2;
  return activeCenter > over.top + over.height / 2 ? "after" : "before";
}

function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function insertAt<T>(items: T[], item: T, index: number | null): T[] {
  const next = [...items];
  next.splice(index == null ? next.length : Math.min(index, next.length), 0, item);
  return next;
}

/**
 * Insère une nouvelle section (issue de la palette). Sans cible (`overId`
 * null : clic, ou dépôt hors zone), ajout à la fin ; cible inconnue, idem.
 */
export function insertSection(
  sections: PortalSection[],
  section: PortalSection,
  overId: string | null,
  position: DropPosition = "before",
): PortalSection[] {
  if (!overId) return [...sections, section];
  const index = sections.findIndex((s) => s.id === overId);
  if (index < 0) return [...sections, section];
  return insertAt(sections, section, index + (position === "after" ? 1 : 0));
}

/**
 * Déplace une section existante vers la cible survolée — sémantique
 * `arrayMove`, alignée sur le tri visuel de dnd-kit. Ids inconnus ou
 * identiques : liste inchangée (même référence).
 */
export function moveSection(
  sections: PortalSection[],
  activeId: string,
  overId: string,
): PortalSection[] {
  if (activeId === overId) return sections;
  const from = sections.findIndex((s) => s.id === activeId);
  const to = sections.findIndex((s) => s.id === overId);
  if (from < 0 || to < 0) return sections;
  return arrayMove(sections, from, to);
}

/**
 * Décale une section d'un cran (boutons ↑ / ↓ du chrome de sélection). En
 * butée ou id inconnu : liste inchangée.
 */
export function shiftSection(
  sections: PortalSection[],
  id: string,
  direction: -1 | 1,
): PortalSection[] {
  const from = sections.findIndex((s) => s.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= sections.length) return sections;
  return arrayMove(sections, from, to);
}

/** Remplace la section de même id (édition contrôlée, immuable). */
export function replaceSection(sections: PortalSection[], section: PortalSection): PortalSection[] {
  return sections.map((s) => (s.id === section.id ? section : s));
}

export function removeSection(sections: PortalSection[], id: string): PortalSection[] {
  return sections.filter((s) => s.id !== id);
}
