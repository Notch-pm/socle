import { describe, expect, it } from "vitest";
import { DEFAULT_ICON, ICON_GROUPS, ICON_OPTIONS, iconFor } from "./icon-options";

/**
 * ⚠️ La liste des valeurs est un CONTRAT : elle est enregistrée en base
 * (`categories.icon`), servie en aval (`PortalCategoryRefDto.icon`), et Nora
 * la redessine depuis son propre registre (`src/features/portal/categoryIcons.ts`
 * du dépôt Nora), épinglé par un test sur cette MÊME liste. Ajouter une valeur
 * se fait ici ET là-bas ; en retirer ou en renommer une, jamais.
 */
const CONTRACT_VALUES = [
  "clipboard-list", "landmark", "file-text", "id-card", "stamp", "scale", "heart", "cross",
  "vote", "users", "calendar", "mail", "credit-card", "receipt", "euro", "baby", "toy-brick",
  "school", "backpack", "utensils", "ferris-wheel", "tent", "bus", "graduation-cap", "smile",
  "person-standing", "stethoscope", "heart-pulse", "hospital", "pill", "heart-handshake",
  "hand-heart", "accessibility", "armchair", "sun", "home", "building-2", "construction",
  "lightbulb", "triangle-alert", "map-pin", "tree-pine", "flower-2", "recycle", "trash-2",
  "droplets", "dog", "car", "square-parking", "bike", "dumbbell", "trophy", "waves", "drama",
  "library", "book-open", "music", "palette", "castle", "party-popper", "ticket", "briefcase",
  "store", "shopping-basket", "handshake", "monitor", "megaphone", "shield-check", "siren",
];

/** Les 21 valeurs d'avant le 2026-10-10 : déjà en base, elles ne bougent plus. */
const HISTORICAL_VALUES = [
  "landmark", "building-2", "heart-handshake", "graduation-cap", "car", "baby", "home",
  "map-pin", "file-text", "users", "stethoscope", "tree-pine", "credit-card", "shield-check",
  "school", "scale", "briefcase", "calendar", "vote", "recycle", "droplets",
];

describe("pictogrammes de catégorie", () => {
  it("propose exactement la liste du contrat, dans l'ordre des groupes", () => {
    expect(ICON_OPTIONS.map((o) => o.value)).toEqual(CONTRACT_VALUES);
  });

  it("garde toutes les valeurs historiques", () => {
    const values = new Set(ICON_OPTIONS.map((o) => o.value));
    for (const value of HISTORICAL_VALUES) expect(values.has(value)).toBe(true);
  });

  it("n'a ni doublon de valeur ni groupe vide, et des valeurs en kebab-case", () => {
    const values = ICON_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) expect(value).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    for (const group of ICON_GROUPS) expect(group.options.length).toBeGreaterThan(0);
  });

  it("couvre les thèmes demandés par les collectivités", () => {
    const labels = ICON_OPTIONS.map((o) => o.label);
    for (const label of [
      "Restauration scolaire", "Accueil périscolaire", "Séjours", "Crèche", "Scolaire",
      "Accueil de loisirs", "Médical", "Quotidien", "Administratif", "Sports", "Culture",
      "Adulte", "Enfant",
    ]) {
      expect(labels).toContain(label);
    }
  });

  it("retombe sur le pictogramme neutre pour une valeur inconnue ou absente", () => {
    expect(iconFor(null)).toBe(DEFAULT_ICON);
    expect(iconFor("licorne")).toBe(DEFAULT_ICON);
    expect(iconFor("utensils")).not.toBe(DEFAULT_ICON);
  });
});
