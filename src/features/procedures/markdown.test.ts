import { describe, it, expect } from "vitest";
import { renderMarkdown, escapeHtml } from "./markdown";

describe("escapeHtml", () => {
  it("échappe les caractères HTML dangereux", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });
});

describe("renderMarkdown — sécurité", () => {
  it("échappe le HTML injecté avant toute transformation", () => {
    const html = renderMarkdown("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("n'autorise que les liens http(s)/mailto ; ignore les schémas dangereux", () => {
    expect(renderMarkdown("[clic](javascript:alert(1))")).not.toContain("<a ");
    expect(renderMarkdown("[clic](javascript:alert(1))")).toContain("clic");

    const safe = renderMarkdown("[site](https://exemple.fr)");
    expect(safe).toContain('<a href="https://exemple.fr"');
    expect(safe).toContain('rel="noopener noreferrer"');
  });
});

describe("renderMarkdown — formatage", () => {
  it("rend le gras, l'italique et le code inline", () => {
    expect(renderMarkdown("**gras**")).toContain("<strong>gras</strong>");
    expect(renderMarkdown("*ital*")).toContain("<em>ital</em>");
    expect(renderMarkdown("_ital_")).toContain("<em>ital</em>");
    expect(renderMarkdown("`code`")).toContain("<code>code</code>");
  });

  it("rend les titres selon leur niveau", () => {
    expect(renderMarkdown("# Titre")).toBe("<h3>Titre</h3>");
    expect(renderMarkdown("## Titre")).toBe("<h4>Titre</h4>");
    expect(renderMarkdown("### Titre")).toBe("<h5>Titre</h5>");
  });

  it("regroupe les puces en une liste non ordonnée", () => {
    expect(renderMarkdown("- un\n- deux")).toBe("<ul><li>un</li><li>deux</li></ul>");
  });

  it("regroupe les items numérotés en une liste ordonnée", () => {
    expect(renderMarkdown("1. un\n2. deux")).toBe("<ol><li>un</li><li>deux</li></ol>");
  });

  it("sépare les paragraphes sur une ligne vide et joint les lignes par <br>", () => {
    expect(renderMarkdown("a\nb\n\nc")).toBe("<p>a<br>b</p><p>c</p>");
  });

  it("renvoie une chaîne vide pour une entrée vide", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown("   \n  ")).toBe("");
  });
});
