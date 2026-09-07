import { describe, expect, it } from "vitest";
import {
  allowedTargets,
  buildTranslationPrompt,
  MAX_LABEL_CHARS,
  MAX_TARGETS,
  parseTranslatePayload,
  parseTranslationAnswer,
  sanitizeLine,
} from "./translate.ts";

const ORG = "11111111-2222-3333-4444-555555555555";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    organization_id: ORG,
    label: "Demande d'acte de naissance",
    targets: [{ code: "en", label: "Anglais" }],
    ...overrides,
  };
}

describe("parseTranslatePayload", () => {
  it("accepte une demande bien formée et retient « procedure » par défaut", () => {
    const parsed = parseTranslatePayload(payload());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.organizationId).toBe(ORG);
    expect(parsed.value.kind).toBe("procedure");
    expect(parsed.value.targets).toEqual([{ code: "en", label: "Anglais" }]);
  });

  it("refuse une clé inconnue — la whitelist dit ce qui entre", () => {
    const parsed = parseTranslatePayload(payload({ model: "gpt-quelque-chose" }));
    expect(parsed).toMatchObject({ ok: false });
  });

  it("exige un UUID d'organisation : le périmètre ne se devine pas", () => {
    expect(parseTranslatePayload(payload({ organization_id: "socle" })).ok).toBe(false);
  });

  it("refuse un libellé vide ou fait d'espaces", () => {
    expect(parseTranslatePayload(payload({ label: "   " })).ok).toBe(false);
  });

  it("normalise le libellé : retours à la ligne, espaces multiples, longueur", () => {
    const parsed = parseTranslatePayload(
      payload({ label: `  Demande\n\n d'acte  ${"x".repeat(MAX_LABEL_CHARS)}` }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.label.startsWith("Demande d'acte ")).toBe(true);
    expect(parsed.value.label.includes("\n")).toBe(false);
    expect(parsed.value.label.length).toBe(MAX_LABEL_CHARS);
  });

  it("refuse un code de langue mal formé", () => {
    expect(parseTranslatePayload(payload({ targets: [{ code: "anglais!", label: "x" }] })).ok)
      .toBe(false);
  });

  it("retombe sur le code quand le libellé de langue manque", () => {
    const parsed = parseTranslatePayload(payload({ targets: [{ code: "gcr" }] }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.targets[0]).toEqual({ code: "gcr", label: "gcr" });
  });

  it("borne le nombre de langues d'un seul appel", () => {
    const targets = Array.from({ length: MAX_TARGETS + 1 }, (_, i) => ({
      code: `x${String(i).padStart(2, "0")}`.slice(0, 3),
      label: "L",
    }));
    expect(parseTranslatePayload(payload({ targets })).ok).toBe(false);
  });

  it("refuse un « kind » inconnu plutôt que de choisir à la place de l'appelant", () => {
    expect(parseTranslatePayload(payload({ kind: "courrier" })).ok).toBe(false);
    expect(parseTranslatePayload(payload({ kind: "category" })).ok).toBe(true);
  });
});

describe("allowedTargets — le recoupement avec les langues de l'organisation", () => {
  const enabled = ["fr", "en", "es", "br"];

  it("ne garde que les langues activées", () => {
    const kept = allowedTargets(
      [{ code: "en", label: "Anglais" }, { code: "de", label: "Allemand" }],
      enabled,
    );
    expect(kept.map((t) => t.code)).toEqual(["en"]);
  });

  it("écarte le français : la langue pivot n'est jamais une traduction", () => {
    expect(allowedTargets([{ code: "fr", label: "Français" }], enabled)).toEqual([]);
  });

  it("dédoublonne et conserve l'ordre demandé", () => {
    const kept = allowedTargets(
      [
        { code: "es", label: "Espagnol" },
        { code: "en", label: "Anglais" },
        { code: "es", label: "Espagnol" },
      ],
      enabled,
    );
    expect(kept.map((t) => t.code)).toEqual(["es", "en"]);
  });

  it("ne garde rien d'une colonne illisible — un tableau absent n'active rien", () => {
    expect(allowedTargets([{ code: "en", label: "Anglais" }], null)).toEqual([]);
    expect(allowedTargets([{ code: "en", label: "Anglais" }], ["fr"])).toEqual([]);
  });
});

describe("buildTranslationPrompt", () => {
  const request = {
    organizationId: ORG,
    label: "Demande d'acte de naissance",
    kind: "procedure" as const,
    targets: [{ code: "en", label: "Anglais" }, { code: "gcr", label: "Créole guyanais" }],
  };

  it("porte le mot « json » — sans lui, `ai-api` refuse avant de réserver", () => {
    expect(buildTranslationPrompt(request).system).toContain("json");
  });

  it("nomme chaque langue par son code ET son libellé", () => {
    const content = buildTranslationPrompt(request).messages[0].content;
    expect(content).toContain("- en (Anglais)");
    expect(content).toContain("- gcr (Créole guyanais)");
    expect(content).toContain("Demande d'acte de naissance");
  });

  it("dit au modèle d'omettre plutôt que de recopier le français", () => {
    expect(buildTranslationPrompt(request).system).toContain("omets la clé");
  });

  it("distingue une catégorie d'une démarche", () => {
    expect(buildTranslationPrompt({ ...request, kind: "category" }).system)
      .toContain("catégorie");
  });

  it("réserve une sortie proportionnée au nombre de langues, toujours bornée", () => {
    const many = { ...request, targets: Array.from({ length: MAX_TARGETS }, (_, i) => ({
      code: `l${i}`.slice(0, 3),
      label: "L",
    })) };
    expect(buildTranslationPrompt(request).maxOutput).toBeLessThan(
      buildTranslationPrompt(many).maxOutput,
    );
    expect(buildTranslationPrompt(many).maxOutput).toBeLessThanOrEqual(2000);
  });
});

describe("parseTranslationAnswer", () => {
  const targets = [{ code: "en", label: "Anglais" }, { code: "es", label: "Espagnol" }];
  const source = "Demande d'acte de naissance";

  it("retient les langues demandées", () => {
    const answer = parseTranslationAnswer(
      '{"en": "Birth certificate request", "es": "Solicitud de partida de nacimiento"}',
      targets,
      source,
    );
    expect(answer.translations).toEqual({
      en: "Birth certificate request",
      es: "Solicitud de partida de nacimiento",
    });
    expect(answer.missing).toEqual([]);
  });

  it("écarte une langue non demandée", () => {
    const answer = parseTranslationAnswer('{"en": "Birth", "de": "Geburt"}', targets, source);
    expect(answer.translations).toEqual({ en: "Birth" });
    expect(answer.missing).toEqual(["es"]);
  });

  it("écarte une traduction identique au français — elle gèlerait le repli", () => {
    const answer = parseTranslationAnswer(
      `{"en": "Birth", "es": "  ${source.toUpperCase()} "}`,
      targets,
      source,
    );
    expect(answer.translations).toEqual({ en: "Birth" });
    expect(answer.missing).toEqual(["es"]);
  });

  it("écarte une valeur vide : c'est l'absence de traduction", () => {
    const answer = parseTranslationAnswer('{"en": "   ", "es": null}', targets, source);
    expect(answer.translations).toEqual({});
    expect(answer.missing).toEqual(["en", "es"]);
  });

  it("récupère un objet enveloppé dans une clôture Markdown", () => {
    const answer = parseTranslationAnswer(
      '```json\n{"en": "Birth certificate request"}\n```',
      targets,
      source,
    );
    expect(answer.translations).toEqual({ en: "Birth certificate request" });
  });

  it("récupère un objet précédé d'une phrase du modèle", () => {
    const answer = parseTranslationAnswer(
      'Voici les traductions : {"en": "Birth"} — bonne journée',
      targets,
      source,
    );
    expect(answer.translations).toEqual({ en: "Birth" });
  });

  it("une réponse illisible ne casse rien : tout est simplement manquant", () => {
    const answer = parseTranslationAnswer("je ne sais pas", targets, source);
    expect(answer.translations).toEqual({});
    expect(answer.missing).toEqual(["en", "es"]);
  });

  it("ne laisse pas une réponse bavarde s'installer dans un intitulé", () => {
    const long = "x".repeat(500);
    const answer = parseTranslationAnswer(`{"en": "${long}"}`, targets, source);
    expect(answer.translations.en.length).toBe(300);
  });
});

describe("sanitizeLine", () => {
  it("retire les caractères de contrôle", () => {
    expect(sanitizeLine("a\u0000b\u0007c", 50)).toBe("a b c");
  });

  it("rend une chaîne vide pour ce qui n'est pas une chaîne", () => {
    expect(sanitizeLine(42, 50)).toBe("");
    expect(sanitizeLine(undefined, 50)).toBe("");
  });
});
