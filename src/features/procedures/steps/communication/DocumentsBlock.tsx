import * as React from "react";
import { Plus, Trash2, FileSignature, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DOCUMENT_VISIBILITIES,
  availableTemplates,
  documentVisibilityLabel,
  resolveDocuments,
  type CommunicationDocument,
  type DocumentGroup,
  type DocumentVisibility,
} from "@/features/procedures/communication";
import { documentTemplateTypeLabel } from "@/features/documents/documentTemplates";
import type { DocumentTemplate } from "@/features/documents/useDocumentTemplates";

/**
 * Un sous-groupe (Documents ou Courriers) : la liste des documents choisis, et
 * de quoi en ajouter un. Le sélecteur et le bouton sont **inactifs** dès qu'il
 * ne reste rien à proposer — tout le groupe est déjà pris, ou le catalogue est
 * vide.
 */
function DocumentGroupSection({
  group,
  title,
  description,
  emptyCatalogue,
  icon,
  templates,
  selected,
  restrictVisibility,
  onChange,
}: {
  group: DocumentGroup;
  title: string;
  description: string;
  emptyCatalogue: string;
  icon: React.ReactNode;
  templates: DocumentTemplate[];
  selected: CommunicationDocument[];
  restrictVisibility: boolean;
  onChange: (next: CommunicationDocument[]) => void;
}) {
  const [pending, setPending] = React.useState("");

  const available = React.useMemo(
    () => availableTemplates(templates, group, selected),
    [templates, group, selected],
  );
  // Les références dont le document a disparu du catalogue sont écartées ici
  // comme elles le seront par l'API : ce que l'écran montre est ce qui sera servi.
  const resolved = React.useMemo(
    () => resolveDocuments(selected, templates),
    [selected, templates],
  );

  const nothingLeft = available.length === 0;

  // Le document pré-choisi peut disparaître de la liste (ajouté, ou retiré du
  // catalogue par ailleurs) : on ne garde pas un identifiant devenu invalide.
  React.useEffect(() => {
    if (pending && !available.some((t) => t.id === pending)) setPending("");
  }, [pending, available]);

  function handleAdd() {
    if (!pending) return;
    onChange([...selected, { id: pending, visibility: "toujours" }]);
    setPending("");
  }

  function handleRemove(id: string) {
    onChange(selected.filter((d) => d.id !== id));
  }

  function handleVisibility(id: string, visibility: DocumentVisibility) {
    onChange(selected.map((d) => (d.id === id ? { ...d, visibility } : d)));
  }

  const selectId = `comm-doc-add-${group}`;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </h4>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>

      {resolved.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {resolved.map(({ template, visibility }) => (
            <li
              key={template.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{template.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {template.file_name}
                  <Badge variant="muted" className="ml-2">
                    {documentTemplateTypeLabel(template.type)}
                  </Badge>
                </p>
              </div>

              {restrictVisibility ? (
                <select
                  value={visibility}
                  onChange={(e) =>
                    handleVisibility(template.id, e.target.value as DocumentVisibility)
                  }
                  aria-label={`Visibilité de « ${template.name} »`}
                  className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {DOCUMENT_VISIBILITIES.map((v) => (
                    <option key={v} value={v}>
                      {documentVisibilityLabel(v)}
                    </option>
                  ))}
                </select>
              ) : null}

              <Button
                type="button"
                variant="ghost"
                size="icon"
                title={`Retirer « ${template.name} »`}
                onClick={() => handleRemove(template.id)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          Aucun élément sélectionné.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          id={selectId}
          value={pending}
          disabled={nothingLeft}
          onChange={(e) => setPending(e.target.value)}
          aria-label={`Ajouter dans « ${title} »`}
          className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="" disabled>
            {templates.length === 0
              ? emptyCatalogue
              : nothingLeft
                ? "Tout est déjà sélectionné"
                : "Choisir…"}
          </option>
          {available.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <Button type="button" variant="outline" disabled={nothingLeft || !pending} onClick={handleAdd}>
          <Plus />
          Ajouter
        </Button>
      </div>
    </section>
  );
}

/**
 * Bloc « Documents et courriers » de l'étape Communication : ce que l'agent
 * pourra produire depuis cette démarche, puisé dans le catalogue de
 * l'organisation principale (`document_templates`).
 */
export function DocumentsBlock({
  templates,
  loading,
  documents,
  letters,
  restrictVisibility,
  onChangeDocuments,
  onChangeLetters,
}: {
  templates: DocumentTemplate[];
  loading: boolean;
  documents: CommunicationDocument[];
  letters: CommunicationDocument[];
  restrictVisibility: boolean;
  onChangeDocuments: (next: CommunicationDocument[]) => void;
  onChangeLetters: (next: CommunicationDocument[]) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg border border-border bg-muted/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <DocumentGroupSection
        group="document"
        title="Documents"
        description="Notices, formulaires et pièces internes ou externes du catalogue."
        emptyCatalogue="Aucun document au catalogue"
        icon={<FileSignature className="size-4 text-muted-foreground" />}
        templates={templates}
        selected={documents}
        restrictVisibility={restrictVisibility}
        onChange={onChangeDocuments}
      />

      <DocumentGroupSection
        group="letter"
        title="Courriers"
        description="Les modèles de courrier du catalogue."
        emptyCatalogue="Aucun courrier au catalogue"
        icon={<Mail className="size-4 text-muted-foreground" />}
        templates={templates}
        selected={letters}
        restrictVisibility={restrictVisibility}
        onChange={onChangeLetters}
      />
    </div>
  );
}
