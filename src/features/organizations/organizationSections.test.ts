import { describe, it, expect } from "vitest";
import { currentOrgSection, organizationSectionGroups } from "./organizationSections";

type Org = { parent_id: string | null; is_internal_service: boolean };
const root: Org = { parent_id: null, is_internal_service: false };
const annexe: Org = { parent_id: "racine", is_internal_service: false };
const service: Org = { parent_id: "racine", is_internal_service: true };

const keys = (o: Org) =>
  organizationSectionGroups(o).flatMap((g) => g.items.map((i) => i.key));

describe("organizationSectionGroups", () => {
  it("range les sections en trois groupes", () => {
    expect(organizationSectionGroups(root).map((g) => g.label)).toEqual([
      "Identité",
      "Site de démarches",
      "Envoi des e-mails",
    ]);
  });

  it("ne porte plus ce qui a rejoint « Connaissances »", () => {
    expect(keys(root)).toEqual([
      "general",
      "charte",
      "sous-organisations",
      "domaines",
      "langues",
      "demarches",
      "emails",
    ]);
  });

  it("⚠️ retire les domaines d'un service interne, que le site n'affiche pas", () => {
    expect(keys(service)).not.toContain("domaines");
    // Il instruit : ses démarches restent.
    expect(keys(service)).toContain("demarches");
  });

  it("cadenasse les langues d'une sous-organisation, pas de la racine", () => {
    const langues = (o: Org) =>
      organizationSectionGroups(o).flatMap((g) => g.items).find((i) => i.key === "langues");
    expect(langues(annexe)?.inherited).toBe(true);
    expect(langues(root)?.inherited).toBe(false);
  });
});

describe("currentOrgSection", () => {
  it("ouvre la section demandée", () => {
    expect(currentOrgSection(organizationSectionGroups(root), "emails").key).toBe("emails");
  });

  it("retombe sur les informations générales sinon", () => {
    expect(currentOrgSection(organizationSectionGroups(root), null).key).toBe("general");
    expect(currentOrgSection(organizationSectionGroups(root), "attributions").key).toBe("general");
    // Une section retirée pour cet organisme ne s'ouvre pas par l'URL.
    expect(currentOrgSection(organizationSectionGroups(service), "domaines").key).toBe("general");
  });
});
