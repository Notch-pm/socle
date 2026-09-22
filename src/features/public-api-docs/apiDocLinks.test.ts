import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { API_DOC_LINKS, apiDocLinkTitle } from "./apiDocLinks";

/**
 * Le catalogue est lu par **deux menus** (le rail de l'app, le menu latéral du
 * superadmin) : une route qui n'existe plus n'y casserait rien à la compilation,
 * elle mènerait simplement les deux menus sur l'écran de connexion — un lien
 * mort qu'aucune erreur ne signale. D'où la vérification contre `App.tsx`.
 */
const appSource = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");

describe("catalogue des documentations d'API", () => {
  it("ne pointe que des routes déclarées dans App.tsx", () => {
    for (const link of API_DOC_LINKS) {
      expect(appSource).toContain(`path="${link.path}"`);
    }
  });

  it("place ces routes hors des zones protégées", () => {
    // Elles s'ouvrent dans un nouvel onglet, sans session partagée avec l'app :
    // publiques, sinon un partenaire — ou l'agent lui-même — tomberait sur
    // `/login`. Les routes publiques sont déclarées avant `ProtectedRoute`.
    const guarded = appSource.indexOf("element={<SuperAdminRoute />}");
    expect(guarded).toBeGreaterThan(0);
    for (const link of API_DOC_LINKS) {
      expect(appSource.indexOf(`path="${link.path}"`)).toBeLessThan(guarded);
    }
  });

  it("annonce le nouvel onglet dans l'intitulé", () => {
    // Dans un rail d'icônes, l'intitulé est le seul endroit où prévenir.
    for (const link of API_DOC_LINKS) {
      expect(apiDocLinkTitle(link)).toContain(link.label);
      expect(apiDocLinkTitle(link)).toContain("nouvel onglet");
    }
  });

  it("parle d'usagers, jamais de citoyens", () => {
    // Le référentiel, le portail et l'API disent « usagers » : deux mots pour
    // une même chose finissent par désigner deux choses.
    const wording = API_DOC_LINKS.map((l) => `${l.label} ${l.tagline}`).join(" ").toLowerCase();
    expect(wording).not.toContain("citoyen");
  });
});
