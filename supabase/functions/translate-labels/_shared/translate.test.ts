import { describe, expect, it } from "vitest";
import {
  allowedTargets,
  buildTranslationPrompt,
  FIELD_SPECS,
  MAX_TARGETS,
  parseTranslatePayload,
  parseTranslationAnswer,
  targetBatches,
  GUICHET_MAX_OUTPUT,
  sanitizeLine,
  sanitizeText,
  type TranslateField,
} from "./translate.ts";

const ORG = "11111111-2222-3333-4444-555555555555";
const LABEL = "Demande d'acte de naissance";
const DESC = "Pour obtenir une copie de votre acte de naissance.";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    organization_id: ORG,
    fields: [{ key: "name", value: LABEL }],
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
    expect(parsed.value.fields).toEqual([{ key: "name", value: LABEL }]);
    expect(parsed.value.targets).toEqual([{ code: "en", label: "Anglais" }]);
  });

  it("accepte plusieurs textes dans un seul appel", () => {
    const parsed = parseTranslatePayload(
      payload({
        fields: [{ key: "name", value: LABEL }, { key: "short_description", value: DESC }],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.fields.map((f) => f.key)).toEqual(["name", "short_description"]);
  });

  it("refuse une clé inconnue — la whitelist dit ce qui entre", () => {
    const parsed = parseTranslatePayload(payload({ model: "gpt-quelque-chose" }));
    expect(parsed).toMatchObject({ ok: false });
  });

  it("refuse un champ inconnu : `translations` n'a pas de clé libre", () => {
    expect(parseTranslatePayload(payload({ fields: [{ key: "prix", value: "x" }] })).ok)
      .toBe(false);
  });

  it("exige un UUID d'organisation : le périmètre ne se devine pas", () => {
    expect(parseTranslatePayload(payload({ organization_id: "socle" })).ok).toBe(false);
  });

  it("refuse une demande sans aucun texte à traduire", () => {
    expect(parseTranslatePayload(payload({ fields: [] })).ok).toBe(false);
    expect(parseTranslatePayload(payload({ fields: [{ key: "name", value: "   " }] })).ok)
      .toBe(false);
  });

  it("ignore un texte vide sans refuser les autres", () => {
    const parsed = parseTranslatePayload(
      payload({
        fields: [{ key: "name", value: LABEL }, { key: "short_description", value: "  " }],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.fields.map((f) => f.key)).toEqual(["name"]);
  });

  it("normalise un intitulé : retours à la ligne, espaces multiples, longueur", () => {
    const max = FIELD_SPECS.name.maxSource;
    const parsed = parseTranslatePayload(
      payload({ fields: [{ key: "name", value: `  Demande\n\n d'acte  ${"x".repeat(max)}` }] }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.fields[0].value.startsWith("Demande d'acte ")).toBe(true);
    expect(parsed.value.fields[0].value.includes("\n")).toBe(false);
    expect(parsed.value.fields[0].value.length).toBe(max);
  });

  it("garde les retours à la ligne d'un descriptif : ils font partie du texte", () => {
    const parsed = parseTranslatePayload(
      payload({
        fields: [{ key: "short_description", value: "Première ligne.\n\nSeconde ligne." }],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.fields[0].value).toBe("Première ligne.\n\nSeconde ligne.");
  });

  it("laisse au descriptif plus de place qu'à l'intitulé", () => {
    expect(FIELD_SPECS.short_description.maxSource).toBeGreaterThan(FIELD_SPECS.name.maxSource);
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
    kind: "procedure" as const,
    fields: [
      { key: "name", value: LABEL },
      { key: "short_description", value: DESC },
    ] as TranslateField[],
    targets: [{ code: "en", label: "Anglais" }, { code: "gcr", label: "Créole guyanais" }],
  };

  it("porte le mot « json » — sans lui, `ai-api` refuse avant de réserver", () => {
    expect(buildTranslationPrompt(request).system).toContain("json");
  });

  it("nomme chaque langue par son code ET son libellé", () => {
    const content = buildTranslationPrompt(request).messages[0].content;
    expect(content).toContain("- en (Anglais)");
    expect(content).toContain("- gcr (Créole guyanais)");
  });

  it("donne chaque texte sous sa clé — le modèle rend les mêmes", () => {
    const content = buildTranslationPrompt(request).messages[0].content;
    expect(content).toContain(`- name : « ${LABEL} »`);
    expect(content).toContain(`- short_description : « ${DESC} »`);
    expect(buildTranslationPrompt(request).system).toContain('"name": "…", "short_description": "…"');
  });

  it("dit le REGISTRE de chaque texte demandé, et de lui seul", () => {
    const both = buildTranslationPrompt(request).system;
    expect(both).toContain("est un INTITULÉ");
    expect(both).toContain("est le RÉSUMÉ");

    // Un champ qu'on ne demande pas n'est pas décrit : ce serait inviter le
    // modèle à l'inventer.
    const labelOnly = buildTranslationPrompt({ ...request, fields: [request.fields[0]] }).system;
    expect(labelOnly).toContain("est un INTITULÉ");
    expect(labelOnly).not.toContain("est le RÉSUMÉ");
  });

  it("dit au modèle d'omettre plutôt que de recopier le français", () => {
    expect(buildTranslationPrompt(request).system).toContain("omets la clé");
  });

  it("distingue une catégorie d'une démarche", () => {
    expect(buildTranslationPrompt({ ...request, kind: "category" }).system)
      .toContain("catégorie");
  });

  it("réserve une sortie proportionnée aux langues ET aux textes, toujours bornée", () => {
    const labelOnly = { ...request, fields: [request.fields[0]] };
    expect(buildTranslationPrompt(labelOnly).maxOutput)
      .toBeLessThan(buildTranslationPrompt(request).maxOutput);

    const many = {
      ...request,
      targets: Array.from({ length: MAX_TARGETS }, (_, i) => ({
        code: `l${i}`.slice(0, 3),
        label: "L",
      })),
    };
    expect(buildTranslationPrompt(many).maxOutput).toBeLessThanOrEqual(2000);
  });
});

describe("parseTranslationAnswer", () => {
  const targets = [{ code: "en", label: "Anglais" }, { code: "es", label: "Espagnol" }];
  const fields: TranslateField[] = [
    { key: "name", value: LABEL },
    { key: "short_description", value: DESC },
  ];
  const nameOnly: TranslateField[] = [{ key: "name", value: LABEL }];

  it("retient les langues demandées, champ par champ", () => {
    const answer = parseTranslationAnswer(
      '{"en": {"name": "Birth certificate request", "short_description": "To get a copy."},' +
        ' "es": {"name": "Solicitud de partida", "short_description": "Para obtener una copia."}}',
      targets,
      fields,
    );
    expect(answer.translations).toEqual({
      en: { name: "Birth certificate request", short_description: "To get a copy." },
      es: { name: "Solicitud de partida", short_description: "Para obtener una copia." },
    });
    expect(answer.missing).toEqual([]);
  });

  it("garde un champ quand l'autre manque : la langue n'est pas perdue", () => {
    const answer = parseTranslationAnswer('{"en": {"name": "Birth"}}', targets, fields);
    expect(answer.translations).toEqual({ en: { name: "Birth" } });
    // « missing » ne liste que les langues restées ENTIÈREMENT sans traduction.
    expect(answer.missing).toEqual(["es"]);
  });

  it("écarte un champ qui n'était pas demandé", () => {
    const answer = parseTranslationAnswer(
      '{"en": {"name": "Birth", "short_description": "To get a copy."}}',
      targets,
      nameOnly,
    );
    expect(answer.translations).toEqual({ en: { name: "Birth" } });
  });

  it("lit encore la forme plate comme un libellé", () => {
    const answer = parseTranslationAnswer('{"en": "Birth certificate request"}', targets, fields);
    expect(answer.translations).toEqual({ en: { name: "Birth certificate request" } });
  });

  it("écarte une langue non demandée", () => {
    const answer = parseTranslationAnswer(
      '{"en": {"name": "Birth"}, "de": {"name": "Geburt"}}',
      targets,
      fields,
    );
    expect(answer.translations).toEqual({ en: { name: "Birth" } });
    expect(answer.missing).toEqual(["es"]);
  });

  it("écarte une traduction identique au français — elle gèlerait le repli", () => {
    const answer = parseTranslationAnswer(
      `{"en": {"name": "Birth", "short_description": "  ${DESC.toUpperCase()} "},` +
        ` "es": {"name": " ${LABEL} "}}`,
      targets,
      fields,
    );
    expect(answer.translations).toEqual({ en: { name: "Birth" } });
    expect(answer.missing).toEqual(["es"]);
  });

  it("écarte une valeur vide : c'est l'absence de traduction", () => {
    const answer = parseTranslationAnswer(
      '{"en": {"name": "   "}, "es": {"name": null}}',
      targets,
      fields,
    );
    expect(answer.translations).toEqual({});
    expect(answer.missing).toEqual(["en", "es"]);
  });

  it("récupère un objet enveloppé dans une clôture Markdown", () => {
    const answer = parseTranslationAnswer(
      '```json\n{"en": {"name": "Birth certificate request"}}\n```',
      targets,
      fields,
    );
    expect(answer.translations).toEqual({ en: { name: "Birth certificate request" } });
  });

  it("récupère un objet précédé d'une phrase du modèle", () => {
    const answer = parseTranslationAnswer(
      'Voici les traductions : {"en": {"name": "Birth"}} — bonne journée',
      targets,
      fields,
    );
    expect(answer.translations).toEqual({ en: { name: "Birth" } });
  });

  it("une réponse illisible ne casse rien : tout est simplement manquant", () => {
    const answer = parseTranslationAnswer("je ne sais pas", targets, fields);
    expect(answer.translations).toEqual({});
    expect(answer.missing).toEqual(["en", "es"]);
  });

  it("ne laisse pas une réponse bavarde s'installer, chaque champ à sa mesure", () => {
    const long = "x".repeat(3000);
    const answer = parseTranslationAnswer(
      `{"en": {"name": "${long}", "short_description": "${long}"}}`,
      targets,
      fields,
    );
    expect(answer.translations.en.name!.length).toBe(FIELD_SPECS.name.maxTranslation);
    expect(answer.translations.en.short_description!.length)
      .toBe(FIELD_SPECS.short_description.maxTranslation);
  });
});

describe("sanitizeLine / sanitizeText", () => {
  it("retire les caractères de contrôle", () => {
    expect(sanitizeLine("a\u0000b\u0007c", 50)).toBe("a b c");
    expect(sanitizeText("a\u0000b\u0007c", 50)).toBe("a b c");
  });

  it("écrase les sauts de ligne d'un intitulé, les garde dans un texte", () => {
    expect(sanitizeLine("Demande\nd'acte", 50)).toBe("Demande d'acte");
    expect(sanitizeText("Première.\nSeconde.", 50)).toBe("Première.\nSeconde.");
    // Trois sauts et plus, c'est de la mise en page, pas du texte.
    expect(sanitizeText("A.\n\n\n\nB.", 50)).toBe("A.\n\nB.");
  });

  it("rend une chaîne vide pour ce qui n'est pas une chaîne", () => {
    expect(sanitizeLine(42, 50)).toBe("");
    expect(sanitizeText(undefined, 50)).toBe("");
  });
});

/**
 * Les textes d'un bloc de page d'accueil — le troisième `kind`.
 */
describe("portal_section", () => {
  const page = (fields: unknown[], overrides: Record<string, unknown> = {}) => ({
    organization_id: ORG,
    kind: "portal_section",
    fields,
    targets: [{ code: "en", label: "Anglais" }],
    ...overrides,
  });

  it("accepte les quatre textes d'une section", () => {
    const parsed = parseTranslatePayload(
      page([
        { key: "title", value: "Nos démarches" },
        { key: "subtitle", value: "Un seul champ pour toutes vos demandes" },
        { key: "placeholder", value: "Rechercher une démarche" },
        { key: "body", value: "Un paragraphe court." },
      ]),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.fields.map((f) => f.key)).toEqual([
      "title",
      "subtitle",
      "placeholder",
      "body",
    ]);
  });

  it("refuse un champ que le kind ne porte pas", () => {
    // Une section n'a pas de `name`, une catégorie pas de `body` : demander un
    // champ que la ligne ne porte pas, c'est faire payer une traduction que
    // personne n'affichera.
    expect(parseTranslatePayload(page([{ key: "name", value: "x" }])).ok).toBe(false);
    expect(parseTranslatePayload(payload({ fields: [{ key: "body", value: "x" }] })).ok).toBe(false);
    expect(
      parseTranslatePayload(
        payload({ kind: "category", fields: [{ key: "short_description", value: "x" }] }),
      ).ok,
    ).toBe(false);
  });

  it("dit au modèle de quoi il s'agit, et interdit de traduire des coordonnées", () => {
    const parsed = parseTranslatePayload(page([{ key: "body", value: "1 place de la Mairie" }]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const prompt = buildTranslationPrompt(parsed.value);
    expect(prompt.system).toContain("page d'accueil");
    // Le preset « Contact et horaires » fabrique un `body` fait d'une adresse,
    // d'un téléphone et d'un courriel. Un modèle non bridé traduit volontiers
    // « place de la Mairie ».
    expect(prompt.system).toContain("NE TRADUIS PAS les adresses postales");
  });

  it("garde les retours à la ligne d'un paragraphe", () => {
    const parsed = parseTranslatePayload(
      page([{ key: "body", value: "Première ligne.\n\nSeconde ligne." }]),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.fields[0].value).toBe("Première ligne.\n\nSeconde ligne.");
  });
});

/**
 * ⚠️ LE PLAFOND DE SORTIE APPARTIENT AU GUICHET.
 *
 * `ai-api` écrête à `MAX_OUTPUT_TOKENS` : lui en demander plus n'a aucun effet,
 * sinon de recevoir un JSON coupé en deux — donc illisible, donc un appel payé
 * pour rien. On découpe les langues plutôt que de dépasser.
 */
describe("targetBatches", () => {
  const targets = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ code: `l${i}`.slice(0, 3), label: "L" }));

  it("tient en un seul appel quand les textes sont courts", () => {
    const batches = targetBatches(targets(8), [{ key: "name", value: LABEL }]);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(8);
  });

  it("découpe quand un paragraphe multiplie le coût par langue", () => {
    const batches = targetBatches(targets(12), [
      { key: "title", value: "T" },
      { key: "body", value: "Un paragraphe." },
    ]);
    expect(batches.length).toBeGreaterThan(1);
    // Chaque lot doit tenir sous le plafond du guichet.
    for (const batch of batches) {
      const prompt = buildTranslationPrompt({
        organizationId: ORG,
        kind: "portal_section",
        fields: [{ key: "title", value: "T" }, { key: "body", value: "Un paragraphe." }],
        targets: batch,
      });
      expect(prompt.maxOutput).toBeLessThanOrEqual(GUICHET_MAX_OUTPUT);
    }
    // Et aucune langue ne se perd en chemin.
    expect(batches.flat()).toHaveLength(12);
  });

  it("ne rend jamais un lot vide, même pour un texte hors normes", () => {
    expect(targetBatches(targets(1), [{ key: "body", value: "x" }])).toHaveLength(1);
    expect(targetBatches([], [{ key: "name", value: "x" }])).toEqual([]);
  });
});
