/**
 * Logique pure de composition d'une page du portail : insertion, déplacement,
 * remplacement et retrait de sections. Calqué sur `formReorder.ts`, en plus
 * simple — une page est une liste plate, sans imbrication.
 *
 * Aucune dépendance dnd-kit : le composant traduit les événements en appels
 * ici, et c'est ce qui rend le réordonnancement testable.
 *
 * Le pivot est `dropIndex` : l'index de destination, calculé UNE fois à partir
 * de la cible survolée et du côté (avant / après). L'ombre affichée pendant le
 * glisser et le dépôt lui-même partent du même nombre — ce que l'utilisateur
 * voit est exactement là où le bloc va.
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

/**
 * Index d'insertion dans la liste TELLE QU'ELLE EST (l'élément déplacé, s'il
 * y en a un, compte encore). `overId` inconnu ou nul : la fin.
 */
export function dropIndex(
  sections: PortalSection[],
  overId: string | null,
  position: DropPosition = "before",
): number {
  if (!overId) return sections.length;
  const index = sections.findIndex((s) => s.id === overId);
  if (index < 0) return sections.length;
  return index + (position === "after" ? 1 : 0);
}

function insertAt<T>(items: T[], item: T, index: number): T[] {
  const next = [...items];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
  return next;
}

/** Insère une nouvelle section à un index (issue de la palette). */
export function insertSectionAt(
  sections: PortalSection[],
  section: PortalSection,
  index: number,
): PortalSection[] {
  return insertAt(sections, section, index);
}

/**
 * Insère une nouvelle section (issue de la palette) par rapport à une cible.
 * Sans cible (`overId` null : clic, ou dépôt hors zone), ajout à la fin.
 */
export function insertSection(
  sections: PortalSection[],
  section: PortalSection,
  overId: string | null,
  position: DropPosition = "before",
): PortalSection[] {
  return insertSectionAt(sections, section, dropIndex(sections, overId, position));
}

/**
 * Où va un bloc ajouté « en fin de page » (clic dans la palette, dépôt hors de
 * toute zone) : en fin de liste — sauf quand la page se termine par un pied de
 * page, qui reste dernier. Un nouveau pied de page, lui, s'ajoute après.
 */
export function appendIndex(sections: PortalSection[], section: PortalSection): number {
  const last = sections[sections.length - 1];
  if (last?.kind === "footer" && section.kind !== "footer") return sections.length - 1;
  return sections.length;
}

/**
 * Déplace une section existante vers un index de destination exprimé sur la
 * liste AVANT retrait — celui que `dropIndex` rend et que l'ombre affiche. Le
 * retrait décale les suivants d'un cran, d'où la correction. Ids inconnus ou
 * destination sans effet : liste inchangée (même référence).
 */
export function moveSectionToIndex(
  sections: PortalSection[],
  activeId: string,
  rawIndex: number,
): PortalSection[] {
  const from = sections.findIndex((s) => s.id === activeId);
  if (from < 0) return sections;
  const to = from < rawIndex ? rawIndex - 1 : rawIndex;
  if (to === from) return sections;
  const next = [...sections];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/**
 * Déplace une section existante avant ou après la cible survolée. Même
 * arithmétique que l'ombre : c'est `dropIndex` qui décide.
 */
export function moveSection(
  sections: PortalSection[],
  activeId: string,
  overId: string,
  position: DropPosition = "before",
): PortalSection[] {
  if (activeId === overId) return sections;
  if (!sections.some((s) => s.id === overId)) return sections;
  return moveSectionToIndex(sections, activeId, dropIndex(sections, overId, position));
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
  const next = [...sections];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Remplace la section de même id (édition contrôlée, immuable). */
export function replaceSection(sections: PortalSection[], section: PortalSection): PortalSection[] {
  return sections.map((s) => (s.id === section.id ? section : s));
}

export function removeSection(sections: PortalSection[], id: string): PortalSection[] {
  return sections.filter((s) => s.id !== id);
}
