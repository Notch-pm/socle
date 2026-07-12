/**
 * Logique pure du glisser-déposer du concepteur de formulaire : insertion des
 * nœuds issus de la palette et déplacement des nœuds existants. Les champs se
 * déplacent librement entre la racine et les sections (et de section à
 * section) ; les sections, elles, ne vivent qu'au niveau racine (pas
 * d'imbrication).
 */
import { isSection, type Field, type FormNode, type Section } from "./formSchema";

/** Id de la zone de dépôt racine (tout le canevas du concepteur). */
export const ROOT_DROP_ID = "root";

/** Côté d'insertion par rapport à la cible survolée. */
export type DropPosition = "before" | "after";

type Location =
  | { container: "root"; index: number }
  | { container: "section"; sectionId: string; sectionIndex: number; index: number };

/** Localise un nœud par id : à la racine, ou champ dans une section. */
function locate(content: FormNode[], id: string): Location | null {
  for (let i = 0; i < content.length; i++) {
    const node = content[i];
    if (node.id === id) return { container: "root", index: i };
    if (isSection(node)) {
      const j = node.fields.findIndex((f) => f.id === id);
      if (j >= 0) return { container: "section", sectionId: node.id, sectionIndex: i, index: j };
    }
  }
  return null;
}

/** Conteneur + position visés par un dépôt de champ sur `overId` (index null = à la fin). */
type Destination =
  | { container: "root"; index: number | null }
  | { container: "section"; sectionId: string; index: number | null };

function resolveDestination(
  content: FormNode[],
  overId: string,
  position: DropPosition,
): Destination | null {
  if (overId === ROOT_DROP_ID) return { container: "root", index: null };
  const over = locate(content, overId);
  if (!over) return null;
  const offset = position === "after" ? 1 : 0;
  if (over.container === "section") {
    return { container: "section", sectionId: over.sectionId, index: over.index + offset };
  }
  const overNode = content[over.index];
  // Déposé sur une section elle-même → dans la section, à la fin.
  if (isSection(overNode)) return { container: "section", sectionId: overNode.id, index: null };
  return { container: "root", index: over.index + offset };
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

/** Retire un champ de son conteneur (jamais appelé pour une section). */
function removeField(content: FormNode[], from: Location): FormNode[] {
  if (from.container === "root") return content.filter((_, i) => i !== from.index);
  return content.map((node, i) =>
    i === from.sectionIndex && isSection(node)
      ? { ...node, fields: node.fields.filter((_, j) => j !== from.index) }
      : node,
  );
}

/**
 * Insère un nouveau nœud (issu de la palette). Un champ déposé sur une section
 * (ou l'un de ses champs) entre dans la section ; une section reste au niveau
 * racine (déposée sur un champ de section, elle s'insère à côté de celle-ci).
 * Sans cible (`overId` null : clic, ou dépôt hors zone), ajout à la fin.
 */
export function insertNode(
  content: FormNode[],
  node: FormNode,
  overId: string | null,
  position: DropPosition = "before",
): FormNode[] {
  if (isSection(node)) {
    if (!overId || overId === ROOT_DROP_ID) return [...content, node];
    const over = locate(content, overId);
    if (!over) return [...content, node];
    const index =
      (over.container === "root" ? over.index : over.sectionIndex) +
      (position === "after" ? 1 : 0);
    return insertAt(content, node, index);
  }
  const dest = overId ? resolveDestination(content, overId, position) : null;
  if (!dest) return [...content, node];
  if (dest.container === "root") return insertAt(content, node, dest.index);
  return content.map((n) =>
    isSection(n) && n.id === dest.sectionId
      ? { ...n, fields: insertAt(n.fields, node as Field, dest.index) }
      : n,
  );
}

/**
 * Déplace un nœud existant vers la cible survolée. Au sein d'un même
 * conteneur : sémantique `arrayMove` (alignée sur le tri visuel dnd-kit).
 * Entre conteneurs : le champ est inséré avant/après la cible (`position`),
 * ou à la fin s'il est déposé sur le conteneur lui-même.
 */
export function moveNode(
  content: FormNode[],
  activeId: string,
  overId: string,
  position: DropPosition = "before",
): FormNode[] {
  if (activeId === overId) return content;
  const from = locate(content, activeId);
  if (!from) return content;

  // Une section ne se déplace qu'au niveau racine (déposée sur un champ de
  // section, elle se place au rang de la section qui le contient).
  if (from.container === "root" && isSection(content[from.index])) {
    let to: number;
    if (overId === ROOT_DROP_ID) to = content.length - 1;
    else {
      const over = locate(content, overId);
      if (!over) return content;
      to = over.container === "root" ? over.index : over.sectionIndex;
    }
    return to === from.index ? content : arrayMove(content, from.index, to);
  }

  const field = (
    from.container === "root"
      ? content[from.index]
      : (content[from.sectionIndex] as Section).fields[from.index]
  ) as Field;

  const dest = resolveDestination(content, overId, position);
  if (!dest) return content;

  const sameContainer =
    (from.container === "root" && dest.container === "root") ||
    (from.container === "section" &&
      dest.container === "section" &&
      from.sectionId === dest.sectionId);

  if (sameContainer) {
    const over = locate(content, overId); // null seulement pour ROOT_DROP_ID
    if (from.container === "root") {
      const to = over ? over.index : content.length - 1;
      return to === from.index ? content : arrayMove(content, from.index, to);
    }
    const section = content[from.sectionIndex] as Section;
    const to = over && over.container === "section" ? over.index : section.fields.length - 1;
    if (to === from.index) return content;
    return content.map((n, i) =>
      i === from.sectionIndex ? { ...section, fields: arrayMove(section.fields, from.index, to) } : n,
    );
  }

  // Entre conteneurs : les indices de destination restent valides après le
  // retrait, puisque la source est forcément un autre conteneur.
  const removed = removeField(content, from);
  if (dest.container === "root") return insertAt(removed, field, dest.index);
  return removed.map((n) =>
    isSection(n) && n.id === dest.sectionId
      ? { ...n, fields: insertAt(n.fields, field, dest.index) }
      : n,
  );
}
