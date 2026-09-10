import { describe, it, expect } from "vitest";
import {
  SUITE_APPS,
  SUITE_DOMAIN,
  CURRENT_APP,
  appUrl,
  appInitial,
} from "./suiteApps";

describe("suiteApps", () => {
  it("propose les quatre applications de la gamme", () => {
    expect(SUITE_APPS.map((a) => a.key)).toEqual(["socle", "iris", "clara", "ariane"]);
  });

  it("place l'application courante dans le catalogue", () => {
    // Sans quoi le lanceur n'aurait rien à cocher, et l'agent ne saurait pas
    // où il se trouve.
    expect(SUITE_APPS).toContain(CURRENT_APP);
    expect(CURRENT_APP.key).toBe("socle");
  });

  it("dérive l'URL du sous-domaine, en https", () => {
    expect(SUITE_APPS.map(appUrl)).toEqual([
      "https://socle.edilumen.fr",
      "https://iris.edilumen.fr",
      "https://clara.edilumen.fr",
      "https://ariane.edilumen.fr",
    ]);
  });

  it("n'accepte que des clés qui tiennent comme label DNS", () => {
    // La clé EST le sous-domaine : une majuscule ou un accent produirait une
    // adresse qui ne résout pas, et le lanceur mènerait dans le vide.
    for (const app of SUITE_APPS) {
      expect(app.key).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(appUrl(app)).toBe(`https://${app.key}.${SUITE_DOMAIN}`);
    }
  });

  it("ne nomme jamais deux fois la même application", () => {
    expect(new Set(SUITE_APPS.map((a) => a.key)).size).toBe(SUITE_APPS.length);
  });

  it("nomme et décrit chaque application", () => {
    for (const app of SUITE_APPS) {
      expect(app.name.trim()).not.toBe("");
      expect(app.tagline.trim()).not.toBe("");
    }
  });

  it("tire l'initiale du nom", () => {
    expect(SUITE_APPS.map(appInitial)).toEqual(["S", "I", "C", "A"]);
  });
});
