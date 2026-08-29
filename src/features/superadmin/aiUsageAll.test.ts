import { describe, expect, it } from "vitest";
import {
  buildUsageRows,
  GLOBAL_PROVIDER,
  usageTotals,
  type CounterRow,
  type OrgRow,
  type QuotaRow,
} from "./aiUsageAll";

const org = (id: string, name: string, parent: string | null = null): OrgRow =>
  ({ id, name, parent_id: parent });

const quota = (id: string, limit: number, active = true): QuotaRow => ({
  organization_id: id,
  provider: GLOBAL_PROVIDER,
  monthly_limit_tokens: limit,
  is_active: active,
  updated_at: "2026-08-29T10:00:00Z",
});

const counter = (id: string, used: number, reserved = 0): CounterRow => ({
  organization_id: id,
  provider: GLOBAL_PROVIDER,
  used_tokens: used,
  reserved_tokens: reserved,
});

describe("buildUsageRows", () => {
  it("rapproche plafond et compteur de chaque collectivité", () => {
    const [row] = buildUsageRows([org("a", "ACCM")], [quota("a", 1000)], [counter("a", 400, 100)]);
    expect(row.view.limit).toBe(1000);
    expect(row.view.engaged).toBe(500);
    expect(row.view.remaining).toBe(500);
    expect(row.isActive).toBe(true);
  });

  // Un budget est une affaire de collectivité : le trigger l'impose en base,
  // et lister un service ici ferait croire qu'on peut lui en poser un.
  it("ne liste que les organisations principales", () => {
    const rows = buildUsageRows(
      [org("a", "ACCM"), org("b", "Voirie", "a")],
      [], [],
    );
    expect(rows.map((r) => r.name)).toEqual(["ACCM"]);
  });

  // Une collectivité absente du tableau se lirait « ne consomme pas », alors
  // que c'est surtout celle qu'on a oublié de border.
  it("montre une racine sans plafond ni compteur", () => {
    const [row] = buildUsageRows([org("a", "ACCM")], [], []);
    expect(row.view.unlimited).toBe(true);
    expect(row.view.engaged).toBe(0);
    expect(row.updatedAt).toBeNull();
  });

  // Miroir exact de `reserve_ai_usage` : un plafond désactivé ne borne rien.
  it("un plafond désactivé vaut aucun plafond, mais reste distinguable", () => {
    const [row] = buildUsageRows([org("a", "ACCM")], [quota("a", 1000, false)], [counter("a", 50)]);
    expect(row.view.unlimited).toBe(true);
    expect(row.isActive).toBe(false);
    expect(row.updatedAt).not.toBeNull();
  });

  it("ignore les lignes d'un autre fournisseur que la sentinelle globale", () => {
    const [row] = buildUsageRows(
      [org("a", "ACCM")],
      [{ ...quota("a", 1000), provider: "mistral" }],
      [{ ...counter("a", 900), provider: "mistral" }],
    );
    expect(row.view.unlimited).toBe(true);
    expect(row.view.used).toBe(0);
  });

  it("classe par consommation décroissante, puis par nom", () => {
    const rows = buildUsageRows(
      [org("a", "ACCM"), org("b", "Béziers"), org("c", "Arles")],
      [],
      [counter("a", 100), counter("b", 900)],
    );
    expect(rows.map((r) => r.name)).toEqual(["Béziers", "ACCM", "Arles"]);
  });
});

describe("usageTotals", () => {
  const rows = buildUsageRows(
    [org("a", "ACCM"), org("b", "Arles"), org("c", "Béziers"), org("d", "Nîmes")],
    [quota("a", 1000), quota("b", 1000), quota("c", 1000)],
    [counter("a", 900), counter("b", 100), counter("c", 0), counter("d", 50)],
  );

  it("compte les collectivités qui ont consommé, pas celles qui existent", () => {
    expect(usageTotals(rows).active).toBe(3);
  });

  // Additionner les PLAFONDS donnerait un chiffre qui n'est ni une dépense ni
  // un engagement : personne ne consomme son plafond.
  it("somme ce qui est engagé, jamais les plafonds", () => {
    expect(usageTotals(rows).engaged).toBe(1050);
  });

  it("compte les collectivités sans borne et celles en alerte", () => {
    const totals = usageTotals(rows);
    expect(totals.unlimited).toBe(1);
    expect(totals.atRisk).toBe(1);
  });

  it("rend des zéros sur une plateforme vide", () => {
    expect(usageTotals([])).toEqual({ active: 0, engaged: 0, unlimited: 0, atRisk: 0 });
  });
});
