import * as React from "react";
import {
  AGENT_DOC_FORMATS,
  MAX_KB_DOCUMENTS,
  TRAINING_DOC_FORMATS,
  cleanKnowledgeBase,
  parseKnowledgeBase,
  type KnowledgeBase,
} from "@/features/procedures/knowledgeBase";
import type { Procedure } from "@/features/procedures/useProcedures";
import { MarkdownField } from "./connaissances/MarkdownField";
import { LinkListEditor } from "./connaissances/LinkListEditor";
import { FaqEditor } from "./connaissances/FaqEditor";
import { StringListEditor } from "./connaissances/StringListEditor";
import { DocumentsUploader } from "./connaissances/DocumentsUploader";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border p-5">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Étape « Base de connaissances » : informations à destination de l'agent et de
 * son assistant LLM (texte d'aide, procédures, documents, liens, FAQ,
 * garde-fous). Persistée dans `procedures.knowledge_base` (schéma possédé).
 */
export function KnowledgeBaseStep({
  formId,
  procedure,
  onSubmit,
}: {
  formId: string;
  procedure: Procedure;
  onSubmit: (kb: KnowledgeBase) => void;
}) {
  const [kb, setKb] = React.useState<KnowledgeBase>(() =>
    parseKnowledgeBase(procedure.knowledge_base),
  );

  function set<K extends keyof KnowledgeBase>(key: K, value: KnowledgeBase[K]) {
    setKb((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(cleanKnowledgeBase(kb));
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="flex max-w-5xl flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Base de connaissances</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Informations à destination de l'agent et de son assistant IA, pour l'accompagner dans le
          traitement des demandes usagers.
        </p>
      </div>

      <Section
        title="Consignes pour l'agent"
        description="Contexte et marche à suivre, en texte libre (Markdown)."
      >
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <MarkdownField
            id="kb-agent-help"
            label="Texte d'aide pour l'agent"
            hint="Tout ce qui aide l'agent à comprendre et traiter la démarche."
            value={kb.agentHelpText}
            onChange={(v) => set("agentHelpText", v)}
            rows={10}
            placeholder="Points d'attention, cas particuliers, informations de contexte…"
          />
          <MarkdownField
            id="kb-procedures"
            label="Procédures"
            hint="Étapes de traitement, règles internes, circuits de validation."
            value={kb.proceduresText}
            onChange={(v) => set("proceduresText", v)}
            rows={8}
            placeholder="Étapes de traitement, règles internes, circuits de validation…"
          />
        </div>
      </Section>

      <Section
        title="Documents"
        description="Fichiers de référence pour l'agent et pour l'entraînement de l'IA."
      >
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <DocumentsUploader
            title="Documents d'aide agent"
            description="PDF ou images consultables par l'agent pendant le traitement."
            formats={AGENT_DOC_FORMATS}
            maxFiles={MAX_KB_DOCUMENTS}
            organizationId={procedure.organization_id!}
            procedureId={procedure.id}
            kind="agent"
            value={kb.agentDocuments}
            onChange={(v) => set("agentDocuments", v)}
          />
          <DocumentsUploader
            title="Documents d'entraînement IA"
            description="Documents servant à nourrir l'assistant IA."
            formats={TRAINING_DOC_FORMATS}
            maxFiles={MAX_KB_DOCUMENTS}
            note="Les formats texte (txt, md, csv, json) sont les moins coûteux en tokens ; un PDF scanné ou une image nécessitent de l'OCR (plus coûteux)."
            organizationId={procedure.organization_id!}
            procedureId={procedure.id}
            kind="training"
            value={kb.trainingDocuments}
            onChange={(v) => set("trainingDocuments", v)}
          />
        </div>
      </Section>

      <Section title="Liens utiles" description="Ressources en ligne, ajoutables et supprimables.">
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <LinkListEditor
            label="Liens utiles agent"
            hint="Pages de référence utiles à l'agent (réglementation, formulaires, annuaires…)."
            value={kb.agentLinks}
            onChange={(v) => set("agentLinks", v)}
            addLabel="Ajouter un lien"
          />
          <LinkListEditor
            label="Sources de connaissance IA"
            hint="Sources en ligne que l'assistant IA pourra exploiter."
            value={kb.aiSources}
            onChange={(v) => set("aiSources", v)}
            addLabel="Ajouter une source"
          />
        </div>
      </Section>

      <Section
        title="Aide à la décision"
        description="Éléments structurés pour guider l'agent et son assistant IA."
      >
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <FaqEditor
            label="FAQ"
            hint="Questions fréquentes et leurs réponses de référence."
            value={kb.faq}
            onChange={(v) => set("faq", v)}
          />
          <StringListEditor
            label="Garde-fous"
            hint="Ce que l'agent et l'IA ne doivent pas décider ou affirmer ; points d'escalade."
            value={kb.guardrails}
            onChange={(v) => set("guardrails", v)}
            placeholder="ex. Ne jamais valider une demande sans pièce d'identité."
            addLabel="Ajouter un garde-fou"
          />
        </div>
      </Section>
    </form>
  );
}
