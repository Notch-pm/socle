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

  it("⚠️ un orange ou un turquoise n'est PAS sombre : le blanc y perdait (relevé RGAA)", () => {
    // Sous l'ancien seuil (0,4 de luminance), ils recevaient du blanc à 2,97
    // et 3,10 : 1. L'encre sombre y passe à 5,44 et 5,21.
    expect(isDarkColor("#e07b39")).toBe(false);
    expect(isDarkColor("#00a3a3")).toBe(false);
    // La charte de SNA27, elle, reste en blanc : 5,02 contre 3,22.
    expect(isDarkColor("#3b7788")).toBe(true);
  });
});

describe("readableInk", () => {
  it("rend le blanc sur un fond sombre, l'encre sombre sur un fond clair", () => {
    expect(readableInk("#0f1f18", "#1c2220")).toBe(WHITE);
    expect(readableInk("#ffcd57", "#1c2220")).toBe("#1c2220");
  });

  it("choisit l'encre qui contraste le PLUS, pas celle d'un seuil", () => {
    for (const background of ["#089b59", "#e07b39", "#00a3a3", "#3b7788", "#2f6fd0", "#7a3fbf"]) {
      for (const dark of ["#1c2220", "#0d1210"]) {
        const ink = readableInk(background, dark);
        const other = ink === WHITE ? dark : WHITE;
        expect(contrastRatio(ink, background)!).toBeGreaterThanOrEqual(
          contrastRatio(other, background)!,
        );
      }
    }
  });

  it("⚠️ l'ancien vert de la gamme prend l'encre sombre — et ne passe pas pour autant", () => {
    // 3,59 : 1 en blanc, 4,498 en encre sombre : la meilleure des deux, mais
    // sous 4,5. C'était la couleur qui était en cause, pas l'encre — d'où
    // le vert par défaut foncé en `#07854c` le 2026-09-18.
    expect(readableInk("#089b59", "#1c2220")).toBe("#1c2220");
    expect(contrastRatio("#1c2220", "#089b59")!).toBeLessThan(4.5);
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
