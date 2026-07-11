import { describe, it, expect } from "vitest";
import {
  fileExtension,
  sanitizeFileName,
  buildDocumentPath,
  isFormatAllowed,
  acceptAttribute,
  validateDocumentFile,
  MAX_DOCUMENT_SIZE_BYTES,
} from "./procedureStorage";

describe("fileExtension", () => {
  it("extrait l'extension en minuscule, sans point", () => {
    expect(fileExtension("Rapport.PDF")).toBe("pdf");
    expect(fileExtension("archive.tar.gz")).toBe("gz");
  });
  it("renvoie une chaîne vide en l'absence d'extension exploitable", () => {
    expect(fileExtension("README")).toBe("");
    expect(fileExtension(".gitignore")).toBe(""); // pas de nom avant le point
    expect(fileExtension("fichier.")).toBe("");
  });
});

describe("sanitizeFileName", () => {
  it("remplace les caractères non sûrs et retire le chemin", () => {
    expect(sanitizeFileName("C:/dossier/mon fichier (v2).pdf")).toBe("mon-fichier-v2-.pdf");
  });
  it("ne renvoie jamais une chaîne vide", () => {
    expect(sanitizeFileName("   ")).toBe("fichier");
    expect(sanitizeFileName("***")).toBe("fichier");
  });
});

describe("buildDocumentPath", () => {
  it("préfixe par organisation puis démarche puis type (le RLS s'appuie dessus)", () => {
    const path = buildDocumentPath({
      organizationId: "org-1",
      procedureId: "proc-2",
      kind: "agent",
      uid: "u123",
      fileName: "Justif de domicile.pdf",
    });
    expect(path).toBe("org-1/proc-2/agent/u123-Justif-de-domicile.pdf");
    // Le 1er segment doit être l'organisation (contrat RLS).
    expect(path.split("/")[0]).toBe("org-1");
  });
});

describe("isFormatAllowed / acceptAttribute", () => {
  const formats = ["pdf", "png"] as const;
  it("accepte selon l'extension, insensible à la casse", () => {
    expect(isFormatAllowed("a.PDF", formats)).toBe(true);
    expect(isFormatAllowed("a.docx", formats)).toBe(false);
    expect(isFormatAllowed("a", formats)).toBe(false);
  });
  it("accepte tout quand la liste est vide", () => {
    expect(isFormatAllowed("a.exe", [])).toBe(true);
  });
  it("construit l'attribut accept, ou undefined si liste vide", () => {
    expect(acceptAttribute(formats)).toBe(".pdf,.png");
    expect(acceptAttribute([])).toBeUndefined();
  });
});

describe("validateDocumentFile", () => {
  const formats = ["pdf"] as const;
  it("accepte un fichier valide (null = pas d'erreur)", () => {
    expect(validateDocumentFile({ name: "a.pdf", size: 1000 }, formats)).toBeNull();
  });
  it("refuse un format non accepté", () => {
    expect(validateDocumentFile({ name: "a.png", size: 1000 }, formats)).toMatch(/Format non accepté/);
  });
  it("refuse un fichier trop volumineux", () => {
    expect(
      validateDocumentFile({ name: "a.pdf", size: MAX_DOCUMENT_SIZE_BYTES + 1 }, formats),
    ).toMatch(/trop volumineux/);
  });
});
