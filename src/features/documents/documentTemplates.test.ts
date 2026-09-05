import { describe, it, expect } from "vitest";
import {
  DOCUMENT_TEMPLATE_FORMATS,
  DOCUMENT_TEMPLATE_TYPES,
  MAX_TEMPLATE_SIZE_BYTES,
  buildTemplatePath,
  documentTemplateTypeLabel,
  validateTemplateFile,
} from "./documentTemplates";

describe("DOCUMENT_TEMPLATE_TYPES", () => {
  it("propose les trois qualifications demandées", () => {
    expect(DOCUMENT_TEMPLATE_TYPES).toEqual(["interne", "externe", "courrier"]);
  });
});

describe("documentTemplateTypeLabel", () => {
  it("traduit les trois qualifications", () => {
    expect(documentTemplateTypeLabel("interne")).toBe("Interne");
    expect(documentTemplateTypeLabel("externe")).toBe("Externe");
    expect(documentTemplateTypeLabel("courrier")).toBe("Courrier");
  });

  it("rend une valeur inattendue telle quelle plutôt que de la masquer", () => {
    expect(documentTemplateTypeLabel("note")).toBe("note");
  });
});

describe("buildTemplatePath", () => {
  it("préfixe par l'organisation (le RLS s'appuie dessus)", () => {
    const path = buildTemplatePath({
      organizationId: "org-1",
      uid: "u123",
      fileName: "Modele courrier.docx",
    });
    expect(path).toBe("org-1/u123-Modele-courrier.docx");
    expect(path.split("/")[0]).toBe("org-1");
  });

  it("assainit un nom accentué en un chemin sûr et non vide", () => {
    // `sanitizeFileName` décompose en NFKD : le diacritique devient un `-`.
    // Le chemin reste valide et unique, c'est tout ce qu'on lui demande.
    const path = buildTemplatePath({
      organizationId: "org-1",
      uid: "u123",
      fileName: "Accusé de réception.docx",
    });
    expect(path).toBe("org-1/u123-Accuse-de-re-ception.docx");
  });

  it("n'ajoute aucun segment intermédiaire", () => {
    const path = buildTemplatePath({ organizationId: "org-1", uid: "u", fileName: "a.odt" });
    expect(path.split("/")).toHaveLength(2);
  });
});

describe("validateTemplateFile", () => {
  it("accepte les trois formats bureautiques", () => {
    for (const ext of DOCUMENT_TEMPLATE_FORMATS) {
      expect(validateTemplateFile({ name: `modele.${ext}`, size: 1024 })).toBeNull();
    }
  });

  it("refuse un format hors des trois", () => {
    expect(validateTemplateFile({ name: "modele.pdf", size: 1024 })).toMatch(/Format non accepté/);
  });

  it("refuse un fichier sans extension", () => {
    expect(validateTemplateFile({ name: "modele", size: 1024 })).toMatch(/Format non accepté/);
  });

  it("refuse un fichier trop volumineux", () => {
    expect(
      validateTemplateFile({ name: "modele.docx", size: MAX_TEMPLATE_SIZE_BYTES + 1 }),
    ).toMatch(/trop volumineux/);
  });
});
