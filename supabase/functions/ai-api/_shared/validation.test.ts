import { describe, expect, it } from "vitest";
import {
  hasAiScope,
  isUuid,
  parseCompletionPayload,
  resolveRootOrgId,
} from "./validation.ts";
import { clampOutput } from "./tokens.ts";

const parse = (raw: unknown) => parseCompletionPayload(raw, clampOutput);
const base = {
  system: "Tu es l'assistant.",
  messages: [{ role: "user", content: "Quelles pièces exiger ?" }],
};

describe("hasAiScope", () => {
  it("exige le scope dédié — `read` ne suffit pas", () => {
    expect(hasAiScope(["ai"])).toBe(true);
    expect(hasAiScope(["read", "contacts", "ai"])).toBe(true);
    expect(hasAiScope(["read"])).toBe(false);
    expect(hasAiScope(null)).toBe(false);
    expect(hasAiScope("ai")).toBe(false);
  });
});

describe("resolveRootOrgId", () => {
  const rows = [
    { id: "racine", parent_id: null },
    { id: "service", parent_id: "racine" },
    { id: "bureau", parent_id: "service" },
    { id: "autre", parent_id: null },
  ];

  // Le budget est par COLLECTIVITÉ : un appel émis au nom d'un bureau débite
  // la racine, pas le bureau.
  it("remonte jusqu'à la racine, quelle que soit la profondeur", () => {
    expect(resolveRootOrgId(rows, "bureau")).toBe("racine");
    expect(resolveRootOrgId(rows, "service")).toBe("racine");
    expect(resolveRootOrgId(rows, "racine")).toBe("racine");
    expect(resolveRootOrgId(rows, "autre")).toBe("autre");
  });

  it("rend null sur une organisation inconnue", () => {
    expect(resolveRootOrgId(rows, "fantome")).toBeNull();
  });

  it("ne boucle pas sur un cycle", () => {
    const cycle = [{ id: "a", parent_id: "b" }, { id: "b", parent_id: "a" }];
    expect(resolveRootOrgId(cycle, "a")).toBeTruthy();
  });
});

describe("parseCompletionPayload — ce qui passe", () => {
  it("accepte une requête minimale", () => {
    const r = parse(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.system).toBe("Tu es l'assistant.");
      expect(r.value.messages).toHaveLength(1);
      expect(r.value.maxOutput).toBe(900);
      expect(r.value.hint).toBeNull();
    }
  });

  it("retient l'alias, la fonctionnalité et la référence opaque", () => {
    const r = parse({
      ...base,
      agent: "assistant-instruction",
      feature: "assistant-instruction",
      reference: { kind: "request", id: "00000000-0000-4000-8000-000000000001" },
      actor_id: "00000000-0000-4000-8000-000000000002",
      estimated_tokens: 4242,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.agent).toBe("assistant-instruction");
      expect(r.value.referenceKind).toBe("request");
      expect(r.value.hint).toBe(4242);
      expect(r.value.actorId).toBe("00000000-0000-4000-8000-000000000002");
    }
  });

  it("borne la sortie au lieu de refuser", () => {
    expect(parse({ ...base, max_output_tokens: 99999 }).ok).toBe(true);
    const r = parse({ ...base, max_output_tokens: 99999 });
    if (r.ok) expect(r.value.maxOutput).toBe(2000);
  });
});

describe("parseCompletionPayload — ce qui est refusé, et pourquoi", () => {
  // Le Socle reste l'autorité sur le coût : l'appelant passe un alias.
  it("refuse le modèle et l'agent, en nommant l'alias", () => {
    const m = parse({ ...base, model: "mistral-large-latest" });
    expect(m.ok).toBe(false);
    if (!m.ok) expect(m.message).toContain("agent");
    expect(parse({ ...base, agent_id: "ag_123" }).ok).toBe(false);
  });

  it("refuse les outils — chaque outil est un second chemin d'accès non audité", () => {
    expect(parse({ ...base, tools: [] }).ok).toBe(false);
    expect(parse({ ...base, tool_choice: "auto" }).ok).toBe(false);
  });

  it("refuse le streaming — le décompte exige la réponse complète", () => {
    const r = parse({ ...base, stream: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("décompte");
  });

  // L'imputation vient de la clé : sans cela, une application ferait porter sa
  // dépense à une autre.
  it("refuse `consumer` et `organization_id` dans le corps", () => {
    const c = parse({ ...base, consumer: "clara" });
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.message).toContain("clé API");
    expect(parse({ ...base, organization_id: "x" }).ok).toBe(false);
  });

  it("refuse les paramètres d'échantillonnage", () => {
    expect(parse({ ...base, temperature: 0.9 }).ok).toBe(false);
    expect(parse({ ...base, top_p: 0.1 }).ok).toBe(false);
    expect(parse({ ...base, response_format: { type: "json" } }).ok).toBe(false);
  });

  it("refuse toute clé inconnue en la nommant", () => {
    const r = parse({ ...base, surprise: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("surprise");
  });

  // Le prompt système a son propre champ : une seule forme canonique, et le
  // Socle sait le compter à part.
  it("refuse un rôle système dans les messages", () => {
    const r = parse({ ...base, messages: [{ role: "system", content: "x" }, ...base.messages] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("champ « system »");
  });

  it("refuse un système vide, des messages vides, un rôle inconnu", () => {
    expect(parse({ ...base, system: "   " }).ok).toBe(false);
    expect(parse({ ...base, messages: [] }).ok).toBe(false);
    expect(parse({ ...base, messages: [{ role: "tool", content: "x" }] }).ok).toBe(false);
    expect(parse({ ...base, messages: [{ role: "user", content: "  " }] }).ok).toBe(false);
  });

  it("exige que la conversation finisse sur une question", () => {
    const r = parse({
      ...base,
      messages: [{ role: "user", content: "q" }, { role: "assistant", content: "r" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("question");
  });

  it("refuse une référence ou un acteur mal formés", () => {
    expect(parse({ ...base, reference: { kind: "request", id: "pas-un-uuid" } }).ok).toBe(false);
    expect(parse({ ...base, actor_id: "pas-un-uuid" }).ok).toBe(false);
    expect(parse({ ...base, reference: "request" }).ok).toBe(false);
  });

  it("refuse un corps qui n'est pas un objet", () => {
    expect(parse(null).ok).toBe(false);
    expect(parse([]).ok).toBe(false);
    expect(parse("bonjour").ok).toBe(false);
  });
});

describe("isUuid", () => {
  it("reconnaît un uuid et rejette le reste", () => {
    expect(isUuid("00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isUuid("x")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});
