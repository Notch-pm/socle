import { describe, expect, it } from "vitest";
import * as front from "../../../../src/components/layout/suiteApps";
import { appUrl, SUITE_APPS, SUITE_DOMAIN, welcomeApps, welcomeMessage } from "./welcome";

describe("miroir du catalogue des applications", () => {
  it("mêmes clés, noms, accroches et domaine que src/components/layout/suiteApps.ts", () => {
    expect(SUITE_APPS.map((a) => ({ key: a.key, name: a.name, tagline: a.tagline }))).toEqual(
      front.SUITE_APPS.map((a) => ({ key: a.key, name: a.name, tagline: a.tagline })),
    );
    expect(SUITE_DOMAIN).toBe(front.SUITE_DOMAIN);
  });
});

describe("welcomeApps", () => {
  it("le Socle s'il y a un accès, puis les applications, dans l'ordre du lanceur", () => {
    expect(welcomeApps(true, ["clara", "iris"]).map((a) => a.key)).toEqual(["socle", "iris", "clara"]);
  });
  it("sans accès au Socle, et sans Nora (portail des usagers)", () => {
    expect(welcomeApps(false, ["nora", "clara"]).map((a) => a.key)).toEqual(["clara"]);
  });
});

describe("welcomeMessage", () => {
  const apps = welcomeApps(false, ["iris", "clara"]);
  const message = welcomeMessage("Ville <de> Test", apps);

  it("un lien par application, le bouton vers la première", () => {
    expect(message.bodyHtml).toContain(`href="${appUrl(apps[0])}"`);
    expect(message.bodyHtml).toContain('href="https://clara.edilumen.fr"');
    expect(message.action).toEqual({ label: "Ouvrir Iris", url: "https://iris.edilumen.fr" });
    expect(message.text).toContain("- Clara (Gestion du courrier) : https://clara.edilumen.fr");
  });

  it("dit comment se connecter, sans aucun lien d'activation ni mot de passe par application", () => {
    expect(message.text).toContain("Se connecter avec le compte de ma collectivité");
    expect(message.text).toContain("Créer mon compte");
    expect(message.bodyHtml).not.toMatch(/activer-compte|token|verify/i);
  });

  it("échappe le nom de la collectivité", () => {
    expect(message.bodyHtml).toContain("Ville &lt;de&gt; Test");
    expect(message.subject).toBe("Vos accès — Ville <de> Test");
  });
});
