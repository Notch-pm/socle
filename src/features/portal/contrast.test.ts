import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  darkenColor,
  isDarkColor,
  readableInk,
  relativeLuminance,
  WHITE,
  withAlpha,
} from "./contrast";

describe("relativeLuminance", () => {
  it("va du noir au blanc", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBe(1);
  });

  it("rend null sur ce qu'on ne sait pas lire — jamais un chiffre inventé", () => {
    expect(relativeLuminance("rouge")).toBeNull();
    expect(relativeLuminance("#ABC")).toBeNull();
    // Majuscules : la forme stockée est minuscule, on ne devine pas.
    expect(relativeLuminance("#089B59")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("mesure les bornes WCAG", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#089b59", "#089b59")).toBeCloseTo(1, 5);
  });

  it("est symétrique", () => {
    expect(contrastRatio("#089b59", WHITE)).toBe(contrastRatio(WHITE, "#089b59"));
  });

  it("rend null dès qu'une couleur est illisible", () => {
    expect(contrastRatio("chartreuse", "#ffffff")).toBeNull();
  });
});

describe("isDarkColor", () => {
  it("sépare les fonds qui appellent du texte clair", () => {
    expect(isDarkColor("#0f1f18")).toBe(true);
    expect(isDarkColor("#000000")).toBe(true);
    expect(isDarkColor("#ffffff")).toBe(false);
    expect(isDarkColor("#ffcd57")).toBe(false);
  });

  it("traite une couleur illisible comme sombre", () => {
    expect(isDarkColor("rouge")).toBe(true);
  });
});

describe("readableInk", () => {
  it("rend le blanc sur un fond sombre, l'encre sombre sur un fond clair", () => {
    expect(readableInk("#089b59", "#1c2220")).toBe(WHITE);
    expect(readableInk("#ffcd57", "#1c2220")).toBe("#1c2220");
  });
});

describe("darkenColor", () => {
  it("baisse la clarté sans changer la teinte", () => {
    const darker = darkenColor("#089b59");
    expect(darker).not.toBe("#089b59");
    expect(relativeLuminance(darker)!).toBeLessThan(relativeLuminance("#089b59")!);
  });

  it("améliore donc le contraste du blanc posé dessus", () => {
    const before = contrastRatio(WHITE, "#089b59")!;
    const after = contrastRatio(WHITE, darkenColor("#089b59"))!;
    expect(after).toBeGreaterThan(before);
  });

  it("ne fabrique rien à partir d'une couleur illisible : elle ressort telle quelle", () => {
    expect(darkenColor("bleu")).toBe("bleu");
  });

  it("reste bornée : le noir ne devient pas plus noir que noir", () => {
    expect(darkenColor("#000000")).toBe("#000000");
  });
});

describe("withAlpha", () => {
  it("compose une teinte à partir de la couleur reçue", () => {
    expect(withAlpha("#089b59", 0.08)).toBe("rgb(8 155 89 / 0.08)");
  });

  it("rend transparent plutôt qu'une teinte inventée", () => {
    expect(withAlpha("vert", 0.08)).toBe("transparent");
  });
});
