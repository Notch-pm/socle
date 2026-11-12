import { describe, it, expect } from "vitest";
import {
  resolveEmailTemplates,
  filterByApplication,
  filterByOrganization,
  extractVariables,
  unknownVariables,
  unbalancedSections,
  validateEmailTemplate,
  type EmailTemplateDefaultRow,
  type EmailTemplateRow,
} from "./emailTemplates";

const ORG = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

const defaults: EmailTemplateDefaultRow[] = [
  {
    key: "debut_instruction",
    name: "Courriel de début d'instruction",
    description: null,
    subject: "Votre demande {{demande.reference}} est en cours de traitement",
    body: "Bonjour,",
    application_ids: ["iris"],
    variables: ["demande.reference"],
    position: 20,
  },
  {
    key: "accuse_reception",
    name: "Accusé de réception de la demande",
    description: "Au dépôt",
    subject: "Nous avons bien reçu votre demande",
    body: "{{usager.salutation}},",
    application_ids: ["iris"],
    variables: ["usager.salutation"],
    position: 10,
  },
];

function row(partial: Partial<EmailTemplateRow>): EmailTemplateRow {
  return {
    id: "row",
    organization_id: ORG,
    system_key: null,
    name: null,
    description: null,
    subject: "Objet",
    body: "Corps",
    updated_at: "2026-11-12T10:00:00Z",
    ...partial,
  };
}

describe("resolveEmailTemplates", () => {
  it("sans aucune ligne, chaque courriel système est là, au texte du catalogue, dans son ordre", () => {
    const list = resolveEmailTemplates(ORG, defaults, [], []);
    expect(list.map((t) => t.key)).toEqual(["accuse_reception", "debut_instruction"]);
    expect(list.every((t) => t.is_system && !t.is_customized && t.id === null)).toBe(true);
    expect(list[0].subject).toBe("Nous avons bien reçu votre demande");
    expect(list[0].applications).toEqual(["iris"]);
    expect(list[0].organization_id).toBe(ORG);
  });

  it("une surcharge remplace objet et corps, jamais le titre ni les applications", () => {
    const list = resolveEmailTemplates(
      ORG,
      defaults,
      [row({ id: "o1", system_key: "accuse_reception", subject: "Bien reçu !", body: "Merci" })],
      [{ email_template_id: "o1", application_id: "clara" }],
    );
    const accuse = list.find((t) => t.key === "accuse_reception")!;
    expect(accuse).toMatchObject({
      id: "o1",
      subject: "Bien reçu !",
      body: "Merci",
      name: "Accusé de réception de la demande",
      applications: ["iris"],
      is_customized: true,
      default_subject: "Nous avons bien reçu votre demande",
    });
  });

  it("retirer la surcharge rétablit le texte d'origine — le courriel ne disparaît pas", () => {
    const list = resolveEmailTemplates(ORG, defaults, [], []);
    expect(list.find((t) => t.key === "accuse_reception")!.body).toBe("{{usager.salutation}},");
  });

  it("les modèles créés suivent, triés par titre, avec leurs applications", () => {
    const list = resolveEmailTemplates(
      ORG,
      defaults,
      [row({ id: "c2", name: "Relance" }), row({ id: "c1", name: "Invitation" })],
      [
        { email_template_id: "c1", application_id: "nora" },
        { email_template_id: "c1", application_id: "clara" },
      ],
    );
    expect(list.slice(2).map((t) => t.name)).toEqual(["Invitation", "Relance"]);
    expect(list[2]).toMatchObject({ is_system: false, key: null, applications: ["clara", "nora"] });
    expect(list[3].applications).toEqual([]);
  });

  it("ignore les lignes d'une autre organisation", () => {
    const list = resolveEmailTemplates(
      ORG,
      defaults,
      [
        row({ id: "x", organization_id: OTHER, name: "Ailleurs" }),
        row({ id: "y", organization_id: OTHER, system_key: "accuse_reception", subject: "Autre" }),
      ],
      [],
    );
    expect(list).toHaveLength(2);
    expect(list.find((t) => t.key === "accuse_reception")!.subject).toBe(
      "Nous avons bien reçu votre demande",
    );
  });

  it("un modèle créé porte ses organismes ; un courriel système vaut partout (null)", () => {
    const list = resolveEmailTemplates(
      ORG,
      defaults,
      [row({ id: "c1", name: "Invitation" }), row({ id: "c2", name: "Nulle part" })],
      [],
      [
        { email_template_id: "c1", organization_id: "svc-b" },
        { email_template_id: "c1", organization_id: "svc-a" },
      ],
    );
    expect(list.find((t) => t.key === "accuse_reception")!.organization_ids).toBeNull();
    expect(list.find((t) => t.name === "Invitation")!.organization_ids).toEqual(["svc-a", "svc-b"]);
    expect(list.find((t) => t.name === "Nulle part")!.organization_ids).toEqual([]);
    expect(filterByOrganization(list, "svc-a").map((t) => t.name)).toEqual([
      "Accusé de réception de la demande",
      "Courriel de début d'instruction",
      "Invitation",
    ]);
    // Pas de descendance implicite : un autre organisme ne voit que les courriels système.
    expect(filterByOrganization(list, ORG)).toHaveLength(2);
  });

  it("filterByApplication ne garde que les modèles de l'application", () => {
    const list = resolveEmailTemplates(
      ORG,
      defaults,
      [row({ id: "c1", name: "Invitation" })],
      [{ email_template_id: "c1", application_id: "clara" }],
    );
    expect(filterByApplication(list, "clara").map((t) => t.name)).toEqual(["Invitation"]);
    expect(filterByApplication(list, "iris")).toHaveLength(2);
  });
});

describe("variables", () => {
  it("extrait les clés simples et les sections, sans doublon", () => {
    expect(
      extractVariables("{{a.b}} {{#c.d}}x {{ a.b }}{{/c.d}} {{^e}}"),
    ).toEqual(["a.b", "c.d", "e"]);
  });

  it("signale une variable inconnue sans rien refuser", () => {
    expect(unknownVariables("{{usager.nom}} {{usager.nmo}}", ["usager.nom"])).toEqual([
      "usager.nmo",
    ]);
  });

  it("repère une section mal fermée", () => {
    expect(unbalancedSections("{{#a}}x{{/a}}")).toEqual([]);
    expect(unbalancedSections("{{#a}}x")).toEqual(["a"]);
    expect(unbalancedSections("x{{/b}}")).toEqual(["b"]);
    expect(unbalancedSections("{{#a}}{{#b}}{{/a}}{{/b}}")).not.toEqual([]);
  });
});

describe("validateEmailTemplate — miroir des CHECK SQL", () => {
  it("un courriel système n'exige pas de titre", () => {
    expect(validateEmailTemplate({ isSystem: true, subject: "Objet", body: "Corps", allowedVariables: [] })).toEqual({});
  });

  it("un modèle créé exige un titre", () => {
    expect(
      validateEmailTemplate({ isSystem: false, name: "  ", subject: "Objet", body: "Corps", allowedVariables: [] }).name,
    ).toBeDefined();
  });

  it("objet et corps sont obligatoires et bornés", () => {
    const issues = validateEmailTemplate({ isSystem: true, subject: " ", body: "", allowedVariables: [] });
    expect(issues.subject).toBeDefined();
    expect(issues.body).toBeDefined();
    expect(
      validateEmailTemplate({ isSystem: true, subject: "x".repeat(256), body: "y", allowedVariables: [] }).subject,
    ).toBeDefined();
  });

  it("refuse une variable hors catalogue, dans l'objet comme dans le corps", () => {
    const allowed = ["demande.reference"];
    expect(
      validateEmailTemplate({ isSystem: false, name: "T", subject: "{{demande.ref}}", body: "x", allowedVariables: allowed }).subject,
    ).toContain("{{demande.ref}}");
    expect(
      validateEmailTemplate({ isSystem: false, name: "T", subject: "x", body: "{{#demande.lien}}y{{/demande.lien}}", allowedVariables: allowed }).body,
    ).toContain("{{demande.lien}}");
    expect(
      validateEmailTemplate({ isSystem: false, name: "T", subject: "{{demande.reference}}", body: "y", allowedVariables: allowed }),
    ).toEqual({});
  });

  it("refuse une section mal fermée dans le corps", () => {
    expect(
      validateEmailTemplate({ isSystem: true, subject: "Objet", body: "{{#demande.lien}}x", allowedVariables: ["demande.lien"] }).body,
    ).toContain("demande.lien");
  });
});
