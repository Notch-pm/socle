import { describe, expect, it } from "vitest";
import {
  HOSTNAME_MAX_LENGTH,
  normalizeHostname,
  portalUrl,
  validateHostname,
} from "./organizationDomains";

describe("normalizeHostname — la forme qui sera réellement stockée", () => {
  it("range ce que le trigger rangerait : casse, espaces, point final", () => {
    for (const raw of [
      "nantes.edilumen.fr",
      "NANTES.EDILUMEN.FR",
      "  Nantes.Edilumen.fr  ",
      "nantes.edilumen.fr.",
    ]) {
      expect(normalizeHostname(raw), raw).toBe("nantes.edilumen.fr");
    }
  });

  it("accepte une adresse collée depuis un navigateur", () => {
    // C'est le geste le plus probable : on copie la barre d'adresse, on ne
    // retape pas un nom d'hôte nu. Le trigger, lui, ne saurait pas défaire ça.
    for (const raw of [
      "https://nantes.edilumen.fr",
      "https://nantes.edilumen.fr/",
      "http://nantes.edilumen.fr/demarches?a=1",
      "nantes.edilumen.fr:443",
    ]) {
      expect(normalizeHostname(raw), raw).toBe("nantes.edilumen.fr");
    }
  });

  it("ne juge pas de la validité", () => {
    expect(normalizeHostname("PAS UN DOMAINE")).toBe("pas un domaine");
    expect(normalizeHostname("")).toBe("");
  });
});

describe("validateHostname — miroir de la contrainte de la base", () => {
  it("accepte un FQDN, quelle qu'en soit la profondeur", () => {
    for (const raw of [
      "nantes.edilumen.fr",
      "demarches.ville-de-nantes.fr",
      "guichet.mairie.saint-jean-de-luz.fr",
      "ab.fr",
    ]) {
      expect(validateHostname(raw), raw).toBeNull();
    }
  });

  it("refuse un nom d'hôte à label unique", () => {
    expect(validateHostname("edilumen")).toMatch(/deux niveaux/);
  });

  it("traite « localhost » à part, parce que c'est l'erreur qu'on fera", () => {
    // Un message générique renverrait l'administrateur vers une correction
    // impossible : localhost ne PEUT pas être un domaine de collectivité, la
    // simulation locale se règle côté portail.
    const message = validateHostname("localhost");
    expect(message).toMatch(/PORTAL_DEV_DOMAIN_SUFFIX/);
  });

  it("refuse ce que la contrainte refuserait", () => {
    expect(validateHostname("")).toMatch(/Renseignez/);
    expect(validateHostname("-nantes.fr")).toMatch(/commencer et finir/);
    expect(validateHostname("nantes-.fr")).toMatch(/commencer et finir/);
    expect(validateHostname("nantes..fr")).toMatch(/commencer et finir/);
    // Le caractère interdit doit SURVIVRE à la normalisation pour être vu :
    // un chemin, lui, est retiré, et la saisie reste donc valable.
    expect(validateHostname("nantes_edilumen.fr")).toMatch(/lettres, des chiffres/);
    expect(validateHostname("nantes edilumen.fr")).toMatch(/lettres, des chiffres/);
  });

  it("refuse en deçà du plus court FQDN possible, comme la contrainte", () => {
    // La base impose length(hostname) between 4 and 253 : « a.b » est un FQDN
    // bien formé, mais trop court. La règle est celle de la base, pas la nôtre.
    expect(validateHostname("a.b")).toMatch(/trop court/);
  });

  it("refuse au-delà de la longueur maximale d'un domaine", () => {
    const tooLong = "nantes.".repeat(40) + "fr";
    expect(tooLong.length).toBeGreaterThan(HOSTNAME_MAX_LENGTH);
    expect(validateHostname(tooLong)).toMatch(/253 caractères/);
  });

  it("valide la forme NORMALISÉE, pas la saisie", () => {
    // Sans cela, une adresse collée serait refusée alors qu'elle est
    // parfaitement exploitable une fois rangée.
    expect(validateHostname("  HTTPS://Nantes.Edilumen.FR/  ")).toBeNull();
  });
});

describe("portalUrl", () => {
  it("compose l'adresse du portail", () => {
    expect(portalUrl("nantes.edilumen.fr")).toBe("https://nantes.edilumen.fr");
  });
});
