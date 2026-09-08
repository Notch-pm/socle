import { describe, expect, it } from "vitest";
import {
  buildChecklist,
  checklistProgress,
  parseOnboardingStatus,
  type RootOnboardingStatus,
} from "./onboardingChecklist";

const READY: RootOnboardingStatus = {
  smtp_configured: true,
  admin_count: 2,
  category_count: 4,
  procedure_count: 6,
  procedure_production_count: 3,
  activation_count: 5,
  domain_count: 1,
  portal_published: true,
  ai_quota_decided: true,
  ai_quota_active: true,
  logo_present: true,
  contact_role_count: 8,
  application_count: null,
};

describe("parseOnboardingStatus — un lecteur tolérant", () => {
  it("part de zéro quand la RPC ne dit rien", () => {
    const status = parseOnboardingStatus(null);
    expect(status.smtp_configured).toBe(false);
    expect(status.admin_count).toBe(0);
    expect(status.application_count).toBeNull();
  });

  it("ignore les types inattendus au lieu de planter", () => {
    const status = parseOnboardingStatus({ admin_count: "2", smtp_configured: "oui", contact_role_count: 8 });
    expect(status.admin_count).toBe(0);
    expect(status.smtp_configured).toBe(false);
    expect(status.contact_role_count).toBe(8);
  });

  it("distingue « clé absente » de « zéro » pour les applications", () => {
    // Tant que le registre n'existe pas, la ligne ne doit pas apparaître ;
    // dès qu'il existe, zéro est un vrai zéro.
    expect(parseOnboardingStatus({}).application_count).toBeNull();
    expect(parseOnboardingStatus({ application_count: 0 }).application_count).toBe(0);
  });
});

describe("buildChecklist — les lignes et où elles mènent", () => {
  it("coche tout quand tout est là", () => {
    const items = buildChecklist(READY);
    expect(items.every((item) => item.done)).toBe(true);
    expect(checklistProgress(items)).toEqual({ done: 8, total: 8 });
  });

  it("n'affiche la ligne des applications que si le registre existe", () => {
    expect(buildChecklist(READY).some((item) => item.key === "applications")).toBe(false);
    const withApps = buildChecklist({ ...READY, application_count: 0 });
    const line = withApps.find((item) => item.key === "applications");
    expect(line?.done).toBe(false);
    expect(line?.target).toEqual({ kind: "section", section: "applications" });
  });

  it("dit ce qui manque, avec les nombres qui expliquent", () => {
    const items = buildChecklist({
      ...READY,
      procedure_count: 4,
      procedure_production_count: 0,
      activation_count: 0,
      ai_quota_decided: false,
    });
    const byKey = Object.fromEntries(items.map((item) => [item.key, item]));
    expect(byKey.procedures.done).toBe(false);
    expect(byKey.procedures.detail).toMatch(/4 démarches, toutes en brouillon/);
    expect(byKey.activations.done).toBe(false);
    expect(byKey.activations.detail).toMatch(/personne n'active/);
    expect(byKey.ai_quota.done).toBe(false);
    expect(byKey.ai_quota.detail).toMatch(/illimitée/);
  });

  it("tient l'illimité explicite pour une décision", () => {
    const line = buildChecklist({ ...READY, ai_quota_active: false }).find((i) => i.key === "ai_quota");
    expect(line?.done).toBe(true);
    expect(line?.detail).toMatch(/choix explicite/);
  });

  it("ne compte pas le facultatif dans la progression, sans le cacher", () => {
    const items = buildChecklist({ ...READY, portal_published: false, logo_present: false });
    expect(checklistProgress(items)).toEqual({ done: 8, total: 8 });
    expect(items.filter((item) => item.optional && !item.done)).toHaveLength(2);
  });

  it("envoie chaque ligne vers ce qui la règle", () => {
    const items = buildChecklist(READY);
    const target = (key: string) => items.find((item) => item.key === key)?.target;
    expect(target("smtp")).toEqual({ kind: "section", section: "smtp" });
    expect(target("categories")).toEqual({ kind: "section", section: "categories" });
    expect(target("activations")).toEqual({ kind: "section", section: "activations" });
    expect(target("portal")).toEqual({ kind: "portal" });
    // Les rôles se posent seuls : aucune section ne les édite.
    expect(target("contact_roles")).toBeNull();
  });
});
