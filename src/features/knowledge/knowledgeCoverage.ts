import { parseKnowledgeBase } from "@/features/procedures/knowledgeBase";

/**
 * Ce qu'une démarche a de rédigé dans sa base de connaissances, regroupé en
 * quatre colonnes pour la vue « Bases des démarches » (navigation v2,
 * 2026-10-24) — un état, pas un contenu : la base se rédige dans l'éditeur de
 * démarche, étape « Base de connaissances ».
 *
 * Regroupement des huit champs de `knowledge_base` :
 * - **Aide à l'agent** : texte d'aide, procédures, documents d'aide, liens utiles ;
 * - **FAQ** : les questions-réponses ;
 * - **Sources IA** : sources de connaissance et documents d'entraînement ;
 * - **Garde-fous** : ce que l'agent ou l'IA ne doit pas décider ou affirmer.
 *
 * Lu par `parseKnowledgeBase`, le lecteur tolérant du contrat : une entrée
 * ébauchée puis abandonnée ne compte pas, du blanc non plus.
 */
export interface KnowledgeCoverage {
  agentHelp: number;
  faq: number;
  aiSources: number;
  guardrails: number;
}

export const COVERAGE_COLUMNS: { key: keyof KnowledgeCoverage; label: string }[] = [
  { key: "agentHelp", label: "Aide à l'agent" },
  { key: "faq", label: "FAQ" },
  { key: "aiSources", label: "Sources IA" },
  { key: "guardrails", label: "Garde-fous" },
];

const filled = (text: string) => (text.trim() === "" ? 0 : 1);

export function knowledgeCoverage(raw: unknown): KnowledgeCoverage {
  const kb = parseKnowledgeBase(raw);
  return {
    agentHelp:
      filled(kb.agentHelpText) +
      filled(kb.proceduresText) +
      kb.agentDocuments.length +
      kb.agentLinks.length,
    faq: kb.faq.length,
    aiSources: kb.aiSources.length + kb.trainingDocuments.length,
    guardrails: kb.guardrails.filter((g) => g.trim() !== "").length,
  };
}

/** Les quatre colonnes ont-elles quelque chose ? */
export function isCoverageComplete(coverage: KnowledgeCoverage): boolean {
  return COVERAGE_COLUMNS.every(({ key }) => coverage[key] > 0);
}

/** Libellé d'une case : le nombre d'éléments, ou « Vide ». */
export function coverageLabel(key: keyof KnowledgeCoverage, count: number): string {
  if (count === 0) return "Vide";
  if (key === "agentHelp") return "Rédigée";
  if (key === "faq") return count === 1 ? "1 question" : `${count} questions`;
  if (key === "aiSources") return count === 1 ? "1 source" : `${count} sources`;
  return count === 1 ? "1 garde-fou" : `${count} garde-fous`;
}
