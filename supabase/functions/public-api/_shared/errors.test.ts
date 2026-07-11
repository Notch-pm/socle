import { describe, expect, it } from "vitest";
import { errorResponse, jsonResponse } from "./errors.ts";

describe("errorResponse", () => {
  it("mappe le code applicatif vers le bon statut HTTP et enveloppe le message", async () => {
    const res = errorResponse("not_found", "Organisation introuvable.", {});
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    await expect(res.json()).resolves.toEqual({
      error: { code: "not_found", message: "Organisation introuvable." },
    });
  });

  it("401 pour unauthorized", () => {
    expect(errorResponse("unauthorized", "x", {}).status).toBe(401);
  });

  it("conserve les en-têtes fournis (CORS)", () => {
    const res = jsonResponse(200, { ok: true }, { "Access-Control-Allow-Origin": "*" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
