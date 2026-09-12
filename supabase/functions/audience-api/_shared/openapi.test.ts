import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "./openapi.ts";
import { ERROR_CODES, errorBody, errorResponse } from "./errors.ts";
import { DEVICES, PAGES } from "./validation.ts";

const doc = buildOpenApiDocument("https://ex.supabase.co/functions/v1/audience-api") as any;

describe("buildOpenApiDocument", () => {
  it("est un document OpenAPI 3.1 avec le serveur injecté", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers[0].url).toBe("https://ex.supabase.co/functions/v1/audience-api");
    expect(doc.info.version).toBe("1.0.0");
  });

  it("déclare la sécurité par clé API bearer", () => {
    expect(doc.components.securitySchemes.bearerApiKey).toMatchObject({
      type: "http", scheme: "bearer",
    });
    expect(doc.security).toEqual([{ bearerApiKey: [] }]);
  });

  // ⚠️ ÉCRITURE SEULE : pas un seul `get` dans tout le document. Le jour où
  // quelqu'un y ajouterait une lecture, la clé de Nora — posée dans une edge
  // function qui sert des pages publiques — deviendrait un moyen de lire la
  // fréquentation de toutes les collectivités qu'elle sert.
  it("n'expose que deux écritures, aucune lecture", () => {
    expect(Object.keys(doc.paths).sort()).toEqual(["/v1/deposits", "/v1/page-views"]);
    for (const route of Object.keys(doc.paths)) {
      expect(Object.keys(doc.paths[route])).toEqual(["post"]);
    }
  });

  it("les deux routes annoncent les mêmes refus, et un 202", () => {
    for (const route of ["/v1/page-views", "/v1/deposits"]) {
      const codes = Object.keys(doc.paths[route].post.responses).sort();
      expect(codes).toEqual(["202", "400", "401", "403", "404", "500"]);
    }
  });
});

describe("le document dit ce qui est mesuré, et ce qui ne l'est pas", () => {
  // C'est le SEUL endroit où une équipe qui branche la mesure apprend pourquoi
  // aucun consentement n'est demandé. Le dire dans la migration ne suffit pas :
  // personne d'autre que nous ne la lit.
  it("énonce l'absence de donnée personnelle et sa conséquence", () => {
    const description: string = doc.info.description;
    expect(description).toContain("aucun identifiant");
    expect(description).toContain("User-Agent");
    expect(description).toContain("article 82");
  });

  it("définit une visite comme une arrivée, pas comme un visiteur unique", () => {
    const description: string = doc.info.description;
    expect(description).toContain("Une visite = une arrivée");
    expect(description).toContain("Pas un visiteur unique");
  });

  it("exige le scope audience, et dit que les autres ne suffisent pas", () => {
    const description: string = doc.info.description;
    expect(description).toContain("`audience`");
    expect(description).toContain("ne suffisent pas");
  });

  it("dit que le jour vient du serveur", () => {
    expect(doc.info.description).toContain("heure de Paris");
  });
});

describe("les schémas de corps sont fermés", () => {
  // `additionalProperties: false` dans le contrat, whitelist dans le parseur :
  // la même règle, dite aux deux endroits où un consommateur la cherche.
  it("les deux corps refusent toute clé de plus", () => {
    expect(doc.components.schemas.PageView.additionalProperties).toBe(false);
    expect(doc.components.schemas.Deposit.additionalProperties).toBe(false);
  });

  // Les énumérés du contrat viennent du module de validation : deux listes
  // finiraient par diverger, et le contrat mentirait sur ce qui est accepté.
  it("les énumérés sont ceux du parseur", () => {
    expect(doc.components.schemas.PageView.properties.page.enum).toEqual([...PAGES]);
    expect(doc.components.schemas.PageView.properties.device.enum).toEqual([...DEVICES, null]);
  });

  it("le corps d'un dépôt ne porte que les deux identifiants", () => {
    expect(Object.keys(doc.components.schemas.Deposit.properties).sort())
      .toEqual(["procedure_id", "tenant_id"]);
  });
});

describe("les erreurs", () => {
  it("l'enveloppe est celle de la gamme", () => {
    expect(errorBody("bad_request", "x")).toEqual({ error: { code: "bad_request", message: "x" } });
  });

  it("le statut HTTP découle du code applicatif", async () => {
    const response = errorResponse("not_found", "Organisation introuvable.", {});
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Organisation introuvable." },
    });
  });

  // ⚠️ Ni 429 (aucun crédit à épuiser — le frein vit chez l'appelant, au plus
  // près de l'adresse IP que le Socle ne verra jamais), ni 502 (elle n'appelle
  // personne). La liste courte EST le signe que l'API est étroite.
  it("la liste des codes reste courte et sans 429 ni 502", () => {
    expect(Object.keys(ERROR_CODES).sort()).toEqual([
      "bad_request", "forbidden", "internal_error", "method_not_allowed", "not_found", "unauthorized",
    ]);
  });
});
