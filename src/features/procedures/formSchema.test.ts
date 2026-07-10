import { describe, it, expect } from "vitest";
import {
  attachmentFieldsMissingDocumentType,
  conditionSourceFields,
  createField,
  createSection,
  defaultFormSchema,
  isChoiceType,
  isSection,
  parseFormSchema,
  type FormSchema,
} from "./formSchema";

describe("defaultFormSchema", () => {
  it("renvoie un schéma vide versionné", () => {
    expect(defaultFormSchema()).toEqual({ version: 1, content: [] });
  });
});

describe("createField", () => {
  it("champ simple : pas d'options ni de formats", () => {
    const field = createField("text");
    expect(field.type).toBe("text");
    expect(field).not.toHaveProperty("options");
    expect(field).not.toHaveProperty("acceptedFormats");
    expect(field.id).toBeTruthy();
  });

  it("champ de choix : tableau d'options vide", () => {
    expect(createField("radio")).toHaveProperty("options", []);
  });

  it("pièce justificative : un seul fichier + formats par défaut", () => {
    expect(createField("attachment")).toMatchObject({ maxFiles: 1, acceptedFormats: ["pdf"] });
  });
});

describe("createSection / isSection", () => {
  it("une section est marquée kind:section et distinguée d'un champ", () => {
    const section = createSection();
    expect(section).toMatchObject({ kind: "section", fields: [] });
    expect(isSection(section)).toBe(true);
    expect(isSection(createField("text"))).toBe(false);
  });
});

describe("isChoiceType", () => {
  it("distingue les types de choix", () => {
    expect(isChoiceType("select")).toBe(true);
    expect(isChoiceType("checkboxes")).toBe(true);
    expect(isChoiceType("text")).toBe(false);
    expect(isChoiceType("attachment")).toBe(false);
  });
});

describe("conditionSourceFields", () => {
  it("aplati champs racine + champs de sections, exclut les pièces jointes", () => {
    const schema: FormSchema = {
      version: 1,
      content: [
        { id: "f0", key: "top", type: "text", label: "Racine" },
        {
          id: "s1",
          kind: "section",
          title: "S1",
          fields: [
            { id: "f1", key: "a", type: "select", label: "A", options: [] },
            { id: "f2", key: "b", type: "attachment", label: "PJ", acceptedFormats: ["pdf"], maxFiles: 1 },
          ],
        },
      ],
    };
    expect(conditionSourceFields(schema).map((f) => f.id)).toEqual(["f0", "f1"]);
  });
});

describe("attachmentFieldsMissingDocumentType", () => {
  it("liste les pièces jointes sans type (racine + sections) et ignore les autres champs", () => {
    const schema: FormSchema = {
      version: 1,
      content: [
        { id: "t0", key: "nom", type: "text", label: "Nom" },
        { id: "a0", key: "pj0", type: "attachment", label: "PJ sans type", acceptedFormats: [], maxFiles: 1 },
        {
          id: "a1",
          key: "pj1",
          type: "attachment",
          label: "PJ typée",
          acceptedFormats: [],
          maxFiles: 1,
          documentTypeId: "dt-1",
        },
        {
          id: "s1",
          kind: "section",
          title: "S",
          fields: [
            { id: "a2", key: "pj2", type: "attachment", label: "PJ section sans type", acceptedFormats: [], maxFiles: 1 },
          ],
        },
      ],
    };
    expect(attachmentFieldsMissingDocumentType(schema)).toEqual(["a0", "a2"]);
  });

  it("renvoie une liste vide quand toutes les pièces jointes sont typées", () => {
    const schema: FormSchema = {
      version: 1,
      content: [
        { id: "a1", key: "pj", type: "attachment", label: "PJ", acceptedFormats: [], maxFiles: 1, documentTypeId: "dt-9" },
      ],
    };
    expect(attachmentFieldsMissingDocumentType(schema)).toEqual([]);
  });
});

describe("parseFormSchema", () => {
  it("retombe sur un schéma vide pour une entrée nulle ou invalide", () => {
    expect(parseFormSchema(null)).toEqual(defaultFormSchema());
    expect(parseFormSchema("nope")).toEqual(defaultFormSchema());
    expect(parseFormSchema({ content: "pas un tableau" })).toEqual(defaultFormSchema());
  });

  it("valide un contenu mixte (champ racine + section avec champs, condition, PJ, maxLength)", () => {
    const input = {
      version: 1,
      content: [
        { id: "f0", key: "nom", type: "text", label: "Nom", maxLength: 50, placeholder: "Votre nom" },
        {
          id: "s1",
          kind: "section",
          title: "Identité",
          fields: [
            { id: "f1", key: "civilite", type: "radio", label: "Civilité", options: [{ value: "m", label: "M." }] },
            {
              id: "f2",
              key: "justif",
              type: "attachment",
              label: "Justificatif",
              acceptedFormats: ["pdf"],
              maxFiles: 2,
              requiredIf: { combinator: "and", rules: [{ fieldId: "f1", operator: "equals", value: "m" }] },
            },
          ],
        },
      ],
    };
    const parsed = parseFormSchema(input);
    expect(parsed.content).toHaveLength(2);
    expect(parsed.content[0]).toMatchObject({ type: "text", maxLength: 50, placeholder: "Votre nom" });
    expect(isSection(parsed.content[1])).toBe(true);
  });

  it("un schéma généré par les fabriques se re-parse à l'identique", () => {
    const built: FormSchema = {
      version: 1,
      content: [
        createField("email"),
        { ...createSection(), title: "S", fields: [createField("checkboxes"), createField("attachment")] },
      ],
    };
    expect(parseFormSchema(built)).toEqual(built);
  });
});
