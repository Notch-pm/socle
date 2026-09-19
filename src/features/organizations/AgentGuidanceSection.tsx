import * as React from "react";
import { Loader2, Users as UsersIcon } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import { MarkdownField } from "@/features/procedures/steps/connaissances/MarkdownField";
import { FaqEditor } from "@/features/procedures/steps/connaissances/FaqEditor";
import { LinkListEditor } from "@/features/procedures/steps/connaissances/LinkListEditor";
import { AddButton, RemoveButton } from "@/features/procedures/steps/connaissances/controls";
import {
  MAX_GUIDANCE_FAQ,
  MAX_GUIDANCE_TEXT_LENGTH,
  MAX_GUIDELINES,
  MAX_GUIDELINE_TEXT_LENGTH,
  MAX_GUIDELINE_TITLE_LENGTH,
  MAX_RECOMMENDED_SOURCES,
  type AgentGuidance,
  type Guideline,
} from "@/features/organizations/agentGuidance";
import { useAgentGuidance, useSaveAgentGuidance } from "@/features/organizations/useAgentGuidance";
import type { Organization } from "@/features/superadmin/organizations/useOrganizationsAdmin";

export const AGENT_GUIDANCE_ROOT_ONLY_MESSAGE =
  "Les recommandations aux agents se paramètrent au niveau de l'organisation principale (racine).";

/** Liste éditable de consignes : un titre, un texte, ajout et suppression. */
function GuidelinesEditor({
  value,
  onChange,
}: {
  value: Guideline[];
  onChange: (value: Guideline[]) => void;
}) {
  const update = (index: number, patch: Partial<Guideline>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  const add = () => onChange([...value, { title: "", text: "" }]);

  return (
    <Field
      label="Consignes générales"
      hint="Ce que tout agent doit respecter, quelle que soit la démarche. Une consigne propre à une démarche l'emporte sur celle-ci."
    >
      <div className="flex flex-col gap-2">
        {value.map((item, index) => (
          <div key={index} className="flex items-start gap-2 rounded-lg border border-border p-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Input
                value={item.title}
                onChange={(e) => update(index, { title: e.target.value })}
                maxLength={MAX_GUIDELINE_TITLE_LENGTH}
                placeholder="Titre de la consigne"
                aria-label="Titre de la consigne"
              />
              <textarea
                value={item.text}
                onChange={(e) => update(index, { text: e.target.value })}
                maxLength={MAX_GUIDELINE_TEXT_LENGTH}
                rows={4}
                placeholder="Texte de la consigne (Markdown)"
                aria-label="Texte de la consigne"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <RemoveButton onClick={() => remove(index)} label="Retirer cette consigne" />
          </div>
        ))}
        {value.length < MAX_GUIDELINES ? (
          <AddButton onClick={add}>Ajouter une consigne</AddButton>
        ) : null}
      </div>
    </Field>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Recommandations aux agents d'une collectivité — composant partagé par les
 * deux zones (onglet d'`OrganizationEditorPage` côté admin, section
 * d'`OrgSettingsPage` côté superadmin), comme `LanguagesSection`.
 *
 * Le réglage n'existe que sur une **organisation principale** : c'est la
 * doctrine de la collectivité, pas celle d'un service. Une sous-organisation le
 * dit et renvoie à sa racine — le trigger `enforce_agent_guidance_root_org`
 * tient la même ligne en base.
 */
export function AgentGuidanceSection({ organization }: { organization: Organization }) {
  const isRoot = organization.parent_id === null;
  const { data: stored, isLoading } = useAgentGuidance(isRoot ? organization.id : undefined);
  const save = useSaveAgentGuidance(organization.id);

  const [draft, setDraft] = React.useState<AgentGuidance | null>(null);

  // Une fois les recommandations enregistrées connues, elles amorcent le formulaire.
  React.useEffect(() => {
    if (stored && draft === null) setDraft(stored.guidance);
  }, [stored, draft]);

  if (!isRoot) {
    return <EmptyState message={AGENT_GUIDANCE_ROOT_ONLY_MESSAGE} />;
  }

  if (isLoading || draft === null) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const patch = (next: Partial<AgentGuidance>) => {
    setDraft((current) => ({ ...(current ?? draft), ...next }));
    save.reset();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(draft);
      }}
      className="flex flex-col gap-6"
    >
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <UsersIcon className="size-5 text-primary" />
            <div>
              <CardTitle className="text-base">Recommandations aux agents</CardTitle>
              <CardDescription>
                Ce que la collectivité dit à ses agents, pour toutes ses démarches à la fois. Les
                applications de la gamme le reprennent : Iris le montre dans sa base de
                connaissances et le donne à son assistant IA. Rien ici n'est montré aux usagers.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <MarkdownField
            id="agent-guidance-role"
            label="Rôle des agents"
            hint="Description générale : ce que la collectivité attend de ses agents."
            value={draft.roleDescription}
            onChange={(roleDescription) => patch({ roleDescription })}
            maxLength={MAX_GUIDANCE_TEXT_LENGTH}
          />
          <MarkdownField
            id="agent-guidance-reception"
            label="Spécificités de l'accueil physique"
            hint="Accueil au guichet : horaires, orientation, confidentialité, cas particuliers…"
            value={draft.physicalReception}
            onChange={(physicalReception) => patch({ physicalReception })}
            maxLength={MAX_GUIDANCE_TEXT_LENGTH}
          />
          <GuidelinesEditor value={draft.guidelines} onChange={(guidelines) => patch({ guidelines })} />
          <FaqEditor
            label="FAQ des agents"
            hint="Questions que se posent les agents, toutes démarches confondues. Distincte de la FAQ de chaque démarche et de la FAQ usager."
            value={draft.faq}
            onChange={(faq) => patch({ faq })}
            max={MAX_GUIDANCE_FAQ}
          />
          <LinkListEditor
            label="Sources de données recommandées"
            hint="Pour l'agent comme pour l'assistant IA, qui les cite sans jamais les ouvrir."
            value={draft.recommendedSources}
            onChange={(recommendedSources) => patch({ recommendedSources })}
            addLabel="Ajouter une source"
            max={MAX_RECOMMENDED_SOURCES}
          />

          {save.isError ? (
            <p className="text-sm text-destructive">{(save.error as Error).message}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
            {save.isSuccess && !save.isPending ? (
              <p className="text-sm text-success">Recommandations enregistrées.</p>
            ) : stored?.updatedAt ? (
              <p className="text-sm text-muted-foreground">
                Dernière mise à jour le {formatDate(stored.updatedAt)}.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
