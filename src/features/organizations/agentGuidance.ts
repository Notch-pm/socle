/**
 * Recommandations aux agents — ce qu'une collectivité dit à SES AGENTS, pour
 * toutes ses démarches à la fois. Logique pure (aucune dépendance React/
 * Supabase), consommée par `AgentGuidanceSection` et persistée dans
 * `organization_agent_guidance.guidance`, sur l'organisation principale.
 *
 * Schéma **possédé**, contrat public consommé en aval
 * (`GET /v1/organizations/{id}/agent-guidance`) : Iris le montre dans sa base de
 * connaissances et le donne à son assistant IA.
 *
 * ⚠️ **C'est la version GLOBALE de `procedures.knowledge_base`**, pas un
 * doublon : même public (l'agent et son assistant), mêmes briques (`FaqItem`,
 * `KbLink`, lues par les mêmes parseurs). Les deux ne se fusionnent jamais, et
 * la consigne d'une démarche l'emporte sur la consigne générale.
 *
 * ⚠️ **« Consignes générales », pas « procédures »** : le mot désigne déjà les
 * démarches (table `procedures`) et la procédure de traitement d'UNE démarche
 * (`knowledge_base.proceduresText`). Clé : `guidelines`.
 *
 * ⚠️ **Interne** : rien ici ne va au portail usager.
 */
import { parseFaq, parseLinks, type FaqItem, type KbLink } from "@/features/procedures/knowledgeBase";

/** Une consigne générale : un titre et son texte (Markdown). */
export interface Guideline {
  title: string;
  text: string;
}

export interface AgentGuidance {
  /** Description générale du rôle des agents (Markdown). */
  roleDescription: string;
  /** Spécificités de l'accueil physique (Markdown). */
  physicalReception: string;
  /** Consignes générales à respecter, dans l'ordre de lecture. */
  guidelines: Guideline[];
  /** FAQ des agents — distincte de la FAQ de chaque démarche et de la FAQ usager. */
  faq: FaqItem[];
  /**
   * Sources de données recommandées, pour l'agent comme pour l'assistant IA.
   * ⚠️ L'assistant les CITE, il ne les ouvre jamais.
   */
  recommendedSources: KbLink[];
}

/**
 * Bornes de saisie. Elles poussent à la concision — l'assistant IA d'Iris ne
 * garde de ce bloc que quelques milliers de jetons — sans rien interdire
 * d'utile. La base porte un garde-fou plus large sur la ligne entière.
 */
export const MAX_GUIDANCE_TEXT_LENGTH = 8_000;
export const MAX_GUIDELINES = 20;
export const MAX_GUIDELINE_TITLE_LENGTH = 150;
export const MAX_GUIDELINE_TEXT_LENGTH = 3_000;
export const MAX_GUIDANCE_FAQ = 30;
export const MAX_RECOMMENDED_SOURCES = 20;

/** Recommandations vierges. */
export function defaultAgentGuidance(): AgentGuidance {
  return {
    roleDescription: "",
    physicalReception: "",
    guidelines: [],
    faq: [],
    recommendedSources: [],
  };
}

function coerceString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseGuidelines(raw: unknown): Guideline[] {
  if (!Array.isArray(raw)) return [];
  const out: Guideline[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { title, text } = item as Record<string, unknown>;
    const entry: Guideline = { title: coerceString(title), text: coerceString(text) };
    // Une ligne ébauchée puis abandonnée n'est pas une consigne.
    if (entry.title.trim() || entry.text.trim()) out.push(entry);
  }
  return out;
}

/**
 * Lecture tolérante d'un JSON stocké : ignore l'inconnu, corrige les types,
 * complète les champs manquants, écarte les entrées de liste entièrement vides.
 * Toujours une structure complète en sortie — et jamais un texte tronqué.
 *
 * ⚠️ Miroir de `supabase/functions/public-api/_shared/agentGuidance.ts` (une
 * edge function n'importe rien de `src/`) : mêmes clés, mêmes règles, testés
 * des deux côtés.
 */
export function parseAgentGuidance(raw: unknown): AgentGuidance {
  const guidance = defaultAgentGuidance();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return guidance;
  const stored = raw as Record<string, unknown>;
  guidance.roleDescription = coerceString(stored.roleDescription);
  guidance.physicalReception = coerceString(stored.physicalReception);
  guidance.guidelines = parseGuidelines(stored.guidelines);
  guidance.faq = parseFaq(stored.faq);
  guidance.recommendedSources = parseLinks(stored.recommendedSources);
  return guidance;
}

/** Normalise avant persistance : mêmes règles que la lecture. */
export function cleanAgentGuidance(guidance: AgentGuidance): AgentGuidance {
  return parseAgentGuidance(guidance);
}

/** Rien d'écrit ? Des blancs ne sont pas un texte. */
export function isAgentGuidanceEmpty(guidance: AgentGuidance): boolean {
  return (
    guidance.roleDescription.trim() === "" &&
    guidance.physicalReception.trim() === "" &&
    guidance.guidelines.length === 0 &&
    guidance.faq.length === 0 &&
    guidance.recommendedSources.length === 0
  );
}
