import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SMTP_PORT,
  PLATFORM_SMTP_SECRETS,
  resolveSmtp,
  senderHeader,
  siteNameFor,
  smtpFromEnv,
  smtpFromRow,
  useImplicitTls,
} from "./smtp";

const ROW = {
  host: " smtp.ville.fr ",
  port: 465,
  username: "mairie",
  password: "secret",
  from_email: "NePasRepondre@Ville.fr",
  from_name: "Mairie de Cahors",
  use_tls: true,
};

const ENV = {
  PLATFORM_SMTP_HOST: "smtp.edilumen.fr",
  PLATFORM_SMTP_PORT: "587",
  PLATFORM_SMTP_USERNAME: "plateforme",
  PLATFORM_SMTP_PASSWORD: "s3cret",
  PLATFORM_SMTP_FROM_EMAIL: "comptes@edilumen.fr",
  PLATFORM_SMTP_FROM_NAME: "Edilumen",
  PLATFORM_SMTP_USE_TLS: "true",
};

describe("smtpFromRow — le relais de la collectivité", () => {
  it("normalise et dit d'où il vient", () => {
    const config = smtpFromRow(ROW);
    expect(config).toMatchObject({
      host: "smtp.ville.fr",
      port: 465,
      fromEmail: "nepasrepondre@ville.fr",
      fromName: "Mairie de Cahors",
      useTls: true,
      source: "collectivite",
    });
  });

  it("vaut null sans hôte ou sans expéditeur", () => {
    expect(smtpFromRow(null)).toBeNull();
    expect(smtpFromRow({ ...ROW, host: "" })).toBeNull();
    expect(smtpFromRow({ ...ROW, from_email: null })).toBeNull();
  });

  it("chiffre par défaut et retombe sur 587 pour un port absurde", () => {
    const config = smtpFromRow({ ...ROW, port: 0, use_tls: null });
    expect(config?.port).toBe(DEFAULT_SMTP_PORT);
    expect(config?.useTls).toBe(true);
  });
});

describe("smtpFromEnv — le relais de plateforme", () => {
  it("lit les secrets PLATFORM_SMTP_*", () => {
    expect(smtpFromEnv(ENV)).toMatchObject({
      host: "smtp.edilumen.fr",
      port: 587,
      username: "plateforme",
      fromEmail: "comptes@edilumen.fr",
      source: "plateforme",
    });
  });

  it("n'existe pas tant que le secret n'est pas posé", () => {
    expect(smtpFromEnv({})).toBeNull();
    expect(smtpFromEnv({ PLATFORM_SMTP_HOST: "smtp.edilumen.fr" })).toBeNull();
  });

  it("nomme les secrets que la doc doit lister", () => {
    for (const name of PLATFORM_SMTP_SECRETS) expect(name).toMatch(/^PLATFORM_SMTP_/);
    expect(PLATFORM_SMTP_SECRETS).toContain("PLATFORM_SMTP_FROM_EMAIL");
  });
});

describe("resolveSmtp — la collectivité d'abord", () => {
  it("préfère le relais de la collectivité quand il existe", () => {
    expect(resolveSmtp(ROW, ENV)?.source).toBe("collectivite");
  });

  it("retombe sur la plateforme quand la collectivité n'en a pas", () => {
    // La poule et l'œuf de la mise en service : inviter le premier
    // administrateur AVANT que la collectivité ait saisi son relais.
    expect(resolveSmtp(null, ENV)?.source).toBe("plateforme");
    expect(resolveSmtp({ host: "", from_email: "" }, ENV)?.source).toBe("plateforme");
  });

  it("ne rend rien quand ni l'un ni l'autre n'existe", () => {
    expect(resolveSmtp(null, {})).toBeNull();
  });
});

describe("les détails nodemailer", () => {
  it("compose l'en-tête From et neutralise les guillemets du nom", () => {
    const config = smtpFromRow({ ...ROW, from_name: 'Mairie "Centre"' })!;
    expect(senderHeader(config)).toBe(`"Mairie 'Centre'" <nepasrepondre@ville.fr>`);
    expect(senderHeader({ ...config, fromName: null })).toBe("nepasrepondre@ville.fr");
  });

  it("ne force le TLS implicite que sur 465", () => {
    expect(useImplicitTls(smtpFromRow(ROW)!)).toBe(true);
    expect(useImplicitTls(smtpFromRow({ ...ROW, port: 587 })!)).toBe(false);
  });

  it("présente le courriel au nom de la collectivité, sinon de la plateforme", () => {
    expect(siteNameFor("Mairie de Cahors", ENV)).toBe("Mairie de Cahors");
    expect(siteNameFor(null, ENV)).toBe("Edilumen");
    expect(siteNameFor("  ", {})).toBe("Edilumen");
  });
});

describe("le module est le même dans les deux fonctions", () => {
  it("invite-user et auth-email-hook portent une copie identique", () => {
    // Pas de `_shared` de premier niveau (voir l'en-tête du module) : la
    // duplication est acceptée, la dérive ne l'est pas.
    const here = readFileSync(new URL("./smtp.ts", import.meta.url), "utf8");
    const there = readFileSync(
      new URL("../../auth-email-hook/_shared/smtp.ts", import.meta.url),
      "utf8",
    );
    expect(there).toBe(here);
  });
});
