import { describe, expect, it } from "vitest";
import { MAX_OCR_PAGES, parseOcrPayload, reservationForOcr, tokensForOcrText } from "./ocr.ts";

const url = "https://exemple.test/storage/v1/object/sign/doc.pdf?token=abc";
const base = { document: { type: "document_url", url } };

describe("parseOcrPayload", () => {
  it("accepte la forme minimale et suppose une page", () => {
    const r = parseOcrPayload(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.documentType).toBe("document_url");
      expect(r.value.url).toBe(url);
      expect(r.value.pageHint).toBe(1);
      expect(r.value.feature).toBe(null);
    }
  });

  it("lit la référence, l'acteur et le libellé", () => {
    const id = "3f6a2c10-0000-4000-8000-000000000001";
    const r = parseOcrPayload({
      ...base,
      feature: "  analyse-courrier  ",
      page_count_hint: 4,
      reference: { kind: "courier", id },
      actor_id: id,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.feature).toBe("analyse-courrier");
      expect(r.value.pageHint).toBe(4);
      expect(r.value.referenceKind).toBe("courier");
      expect(r.value.referenceId).toBe(id);
      expect(r.value.actorId).toBe(id);
    }
  });

  it("accepte une image", () => {
    const r = parseOcrPayload({ document: { type: "image_url", url } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.documentType).toBe("image_url");
  });

  // ── Ce que l'appelant ne décide pas ──────────────────────────────────────

  it("refuse le modèle : le Socle reste l'autorité sur le coût", () => {
    const r = parseOcrPayload({ ...base, model: "mistral-ocr-latest" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("choisi par le Socle");
  });

  it("refuse l'imputation dans le corps", () => {
    expect(parseOcrPayload({ ...base, consumer: "clara" }).ok).toBe(false);
    expect(parseOcrPayload({ ...base, organization_id: "peu importe" }).ok).toBe(false);
  });

  // ⚠️ Sans ce refus, les illustrations du document traverseraient le Socle —
  // quand on a promis de ne faire passer que du texte.
  it("refuse les images encodées dans la réponse", () => {
    const r = parseOcrPayload({ ...base, include_image_base64: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("ne transitent pas par le Socle");
  });

  it("refuse une clé inconnue", () => {
    const r = parseOcrPayload({ ...base, timeout_ms: 90000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("timeout_ms");
  });

  // ── L'URL, qui est un droit d'accès ──────────────────────────────────────

  it("exige https : un lien signé voyage avec son jeton", () => {
    const r = parseOcrPayload({ document: { type: "document_url", url: "http://exemple.test/d.pdf" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("https");
  });

  it("refuse les schémas exotiques", () => {
    for (const bad of ["file:///etc/passwd", "data:application/pdf;base64,AAA", "ftp://h/d.pdf"]) {
      expect(parseOcrPayload({ document: { type: "document_url", url: bad } }).ok).toBe(false);
    }
  });

  it("refuse des identifiants dans le lien", () => {
    const r = parseOcrPayload({
      document: { type: "document_url", url: "https://u:p@exemple.test/d.pdf" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("identifiants");
  });

  it("refuse une URL relative ou vide", () => {
    expect(parseOcrPayload({ document: { type: "document_url", url: "/d.pdf" } }).ok).toBe(false);
    expect(parseOcrPayload({ document: { type: "document_url", url: "  " } }).ok).toBe(false);
  });

  it("refuse un lien démesuré — ce n'est plus un lien", () => {
    const long = `https://exemple.test/d.pdf?t=${"a".repeat(5000)}`;
    expect(parseOcrPayload({ document: { type: "document_url", url: long } }).ok).toBe(false);
  });

  it("refuse un type de document inconnu", () => {
    expect(parseOcrPayload({ document: { type: "video_url", url } }).ok).toBe(false);
  });

  // ── Le nombre de pages ───────────────────────────────────────────────────

  // ⚠️ Le plafond MENSUEL ne borne pas le coût d'UN appel ; celui-ci si.
  it("refuse un document démesuré, avec le code qui le dit", () => {
    const r = parseOcrPayload({ ...base, page_count_hint: MAX_OCR_PAGES + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("payload_too_large");
      expect(r.message).toContain("scindez");
    }
  });

  it("accepte exactement la limite", () => {
    expect(parseOcrPayload({ ...base, page_count_hint: MAX_OCR_PAGES }).ok).toBe(true);
  });

  it("refuse zéro, un négatif, un non-nombre", () => {
    for (const bad of [0, -3, "4", Number.NaN]) {
      expect(parseOcrPayload({ ...base, page_count_hint: bad }).ok).toBe(false);
    }
  });

  it("arrondit une fraction vers le haut", () => {
    const r = parseOcrPayload({ ...base, page_count_hint: 2.1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.pageHint).toBe(3);
  });

  it("refuse un identifiant de référence qui n'est pas un UUID", () => {
    expect(parseOcrPayload({ ...base, reference: { kind: "courier", id: "42" } }).ok).toBe(false);
    expect(parseOcrPayload({ ...base, actor_id: "42" }).ok).toBe(false);
  });
});

describe("reservationForOcr", () => {
  // ⚠️ On surestime DÉLIBÉRÉMENT : sous-réserver ferait passer l'appel puis
  // découvrir la dépense au règlement — dépasser le plafond avant de s'en
  // apercevoir, exactement ce que la porte existe pour empêcher.
  it("réserve à la page, largement", () => {
    expect(reservationForOcr(1)).toBe(1200);
    expect(reservationForOcr(10)).toBe(12000);
  });

  it("un plancher, parce qu'un appel a toujours eu lieu", () => {
    expect(reservationForOcr(0)).toBe(1200);
    expect(reservationForOcr(Number.NaN)).toBe(1200);
  });

  it("arrondit une fraction vers le haut", () => {
    expect(reservationForOcr(2.2)).toBe(3600);
  });
});

describe("tokensForOcrText", () => {
  // ⚠️ Le TEXTE fait foi, pas les pages : une page blanche scannée est
  // facturée par le fournisseur et ne vaut rien à la collectivité. Facturer
  // les pages ferait payer le vide.
  it("compte le texte extrait au tarif maison", () => {
    expect(tokensForOcrText("a".repeat(350))).toBe(100);
  });

  it("jamais zéro : l'appel a bien eu lieu", () => {
    expect(tokensForOcrText("")).toBe(1);
  });

  it("une page blanche coûte le plancher, pas une page", () => {
    expect(tokensForOcrText("")).toBeLessThan(reservationForOcr(1));
  });
});
