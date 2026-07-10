/**
 * Rendu Markdown minimal → HTML, sans dépendance. Utilisé pour l'aperçu des
 * champs riches de la base de connaissances. Le contenu est saisi par des admins
 * de confiance, mais on échappe d'abord TOUTES les entités HTML (défense en
 * profondeur), puis on applique un jeu FIXE de transformations : titres, gras,
 * italique, code, listes, liens, sauts de ligne. Aucune balise autre que celles
 * introduites par ces transformations n'est produite.
 */

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Échappe les caractères HTML dangereux. */
export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

/** Seuls les liens http(s) et mailto sont autorisés (pas de `javascript:` etc.). */
function isSafeUrl(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url);
}

/** Formatage en ligne, appliqué à un texte DÉJÀ échappé. */
function renderInline(escaped: string): string {
  let s = escaped;
  // Liens [libellé](url) — url validée, sinon on ne garde que le libellé.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) =>
    isSafeUrl(url)
      ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : label,
  );
  // Code `inline`
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Gras **texte**
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italique *texte* (hors ** déjà consommés) puis _texte_
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^\w])_([^_\n]+)_/g, "$1<em>$2</em>");
  return s;
}

/** Transforme du Markdown en une chaîne HTML sûre. */
export function renderMarkdown(input: string): string {
  const escaped = escapeHtml(input ?? "");
  const lines = escaped.split(/\r?\n/);
  const blocks: string[] = [];

  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(`<p>${paragraph.map(renderInline).join("<br>")}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listType && listItems.length) {
      const inner = listItems.map((it) => `<li>${renderInline(it)}</li>`).join("");
      blocks.push(`<${listType}>${inner}</${listType}>`);
    }
    listItems = [];
    listType = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      const tag = heading[1].length === 1 ? "h3" : heading[1].length === 2 ? "h4" : "h5";
      blocks.push(`<${tag}>${renderInline(heading[2])}</${tag}>`);
      continue;
    }

    const unordered = /^[-*]\s+(.*)$/.exec(trimmed);
    if (unordered) {
      flushParagraph();
      if (listType !== "ul") flushList();
      listType = "ul";
      listItems.push(unordered[1]);
      continue;
    }

    const ordered = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (ordered) {
      flushParagraph();
      if (listType !== "ol") flushList();
      listType = "ol";
      listItems.push(ordered[1]);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks.join("");
}
