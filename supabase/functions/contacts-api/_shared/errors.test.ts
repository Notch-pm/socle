import { describe, expect, it } from "vitest";
import { ERROR_CODES, errorBody, errorResponse } from "./errors.ts";

describe("errors (contacts-api)", () => {
  it("expose conflict = 409 en plus des codes de public-api", () => {
    expect(ERROR_CODES.conflict).toBe(409);
    expect(ERROR_CODES.bad_request).toBe(400);
    expect(ERROR_CODES.unauthorized).toBe(401);
  });

  it("errorResponse mappe code applicatif → statut HTTP", async () => {
    const res = errorResponse("conflict", "SIRET déjà utilisé.", {});
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(errorBody("conflict", "SIRET déjà utilisé."));
  });
});
