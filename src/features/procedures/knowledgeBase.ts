/**
 * Étape « Base de connaissances » : modèle des informations à destination de
 * l'agent et de son assistant LLM. Logique pure (aucune dépendance React/
 * Supabase), consommée par `KnowledgeBaseStep` et persistée dans
 * `procedures.knowledge_base`. Schéma « possédé » — contrat consommé en aval.
 */

/** Lien (URL + description courte) — liens utiles agent et sources IA. */
export interface KbLink {
  url: string;
  description: string;
}

/** Entrée de FAQ : une question et sa réponse. */
export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Référence vers un document téléversé. L'upload arrive plus tard : le schéma
 * réserve déjà le tableau pour rester compatible quand le stockage sera branché.
 */
export interface KbDocument {
  /** Chemin dans le bucket de stockage. */
  path: string;
  /** Nom de fichier d'origine, affiché à l'agent. */
  name: string;
}

export interface KnowledgeBase {
  /** Texte d'aide pour l'agent (Markdown). */
  agentHelpText: string;
  /** Procédures (Markdown). */
  proceduresText: string;
  /** Documents d'aide agent (PDF/image) — upload à venir. */
  agentDocuments: KbDocument[];
  /** Documents d'entraînement IA — upload à venir. */
  trainingDocuments: KbDocument[];
  /** Liens utiles pour l'agent. */
  agentLinks: KbLink[];
  /** Sources de connaissance pour l'IA. */
  aiSources: KbLink[];
  /** Foire aux questions (couples question/réponse). */
  faq: FaqItem[];
  /** Garde-fous : ce que l'agent/LLM ne doit pas décider ou affirmer. */
  guardrails: string[];
}

/** Formats acceptés pour les documents d'aide agent (upload à venir). */
export const AGENT_DOC_FORMATS = ["pdf", "jpg", "jpeg", "png", "webp"] as const;

/**
 * Formats acceptés pour les documents d'entraînement IA (upload à venir) : ceux
 * demandés + suggestions adaptées au passage d'information à un LLM. Les formats
 * texte (`txt`, `md`, `csv`, `json`) sont les moins coûteux en tokens ; un PDF
 * scanné ou une image nécessitent de l'OCR (coûteux).
 */
export const TRAINING_DOC_FORMATS = [
  "pdf",
  "csv",
  "doc",
  "odt",
  "docx",
  "xls",
  "xlsx",
  "txt",
  "md",
  "json",
  "html",
  "rtf",
  "tsv",
  "pptx",
] as const;

/** Nombre maximum de documents par jeu (aide agent / entraînement IA). */
export const MAX_KB_DOCUMENTS = 10;

/** Base de connaissances vierge. */
export function defaultKnowledgeBase(): KnowledgeBase {
  return {
    agentHelpText: "",
    proceduresText: "",
    agentDocuments: [],
    trainingDocuments: [],
    agentLinks: [],
    aiSources: [],
    faq: [],
    guardrails: [],
  };
}

function coerceString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseLinks(raw: unknown): KbLink[] {
  if (!Array.isArray(raw)) return [];
  const links: KbLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { url, description } = item as Record<string, unknown>;
    const link: KbLink = { url: coerceString(url).trim(), description: coerceString(description) };
    // On ignore les entrées entièrement vides (lignes ébauchées puis abandonnées).
    if (link.url || link.description.trim()) links.push(link);
  }
  return links;
}

function parseFaq(raw: unknown): FaqItem[] {
  if (!Array.isArray(raw)) return [];
  const faq: FaqItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { question, answer } = item as Record<string, unknown>;
    const entry: FaqItem = { question: coerceString(question), answer: coerceString(answer) };
    if (entry.question.trim() || entry.answer.trim()) faq.push(entry);
  }
  return faq;
}

function parseDocuments(raw: unknown): KbDocument[] {
  if (!Array.isArray(raw)) return [];
  const docs: KbDocument[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { path, name } = item as Record<string, unknown>;
    const p = coerceString(path).trim();
    if (!p) continue;
    docs.push({ path: p, name: coerceString(name) || p });
  }
  return docs;
}

function parseGuardrails(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const value = coerceString(item);
    if (value.trim()) out.push(value);
  }
  return out;
}

/**
 * Fusionne une base de connaissances stockée (JSON arbitraire de la base) avec
 * les valeurs par défaut : ignore l'inconnu, corrige les types, complète les
 * champs manquants, écarte les entrées de liste entièrement vides. Toujours une
 * structure complète en sortie.
 */
export function parseKnowledgeBase(raw: unknown): KnowledgeBase {
  const kb = defaultKnowledgeBase();
  if (!raw || typeof raw !== "object") return kb;

  const stored = raw as Record<string, unknown>;
  kb.agentHelpText = coerceString(stored.agentHelpText);
  kb.proceduresText = coerceString(stored.proceduresText);
  kb.agentDocuments = parseDocuments(stored.agentDocuments);
  kb.trainingDocuments = parseDocuments(stored.trainingDocuments);
  kb.agentLinks = parseLinks(stored.agentLinks);
  kb.aiSources = parseLinks(stored.aiSources);
  kb.faq = parseFaq(stored.faq);
  kb.guardrails = parseGuardrails(stored.guardrails);
  return kb;
}

/**
 * Normalise une base de connaissances en mémoire avant persistance : mêmes
 * règles que `parseKnowledgeBase` (les entrées de liste vides sont retirées).
 */
export function cleanKnowledgeBase(kb: KnowledgeBase): KnowledgeBase {
  return parseKnowledgeBase(kb);
}
