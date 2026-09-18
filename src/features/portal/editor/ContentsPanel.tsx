import * as React from "react";
import { ArrowRight, Check, FileText, Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MarkdownField } from "@/features/procedures/steps/connaissances/MarkdownField";
import {
  accessibilityStatementTemplate,
  hasContentBody,
  MAX_CONTENT_BODY_LENGTH,
  PORTAL_CONTENTS,
  type PortalContent,
  type StatementTemplateSource,
} from "@/features/portal/portalContent";
import type { PortalTheme } from "@/features/portal/portalTheme";

export interface ContentsPanelProps {
  /** La déclaration d'accessibilité, en brouillon — possédée par le parent. */
  statement: PortalContent;
  onStatementChange: (content: PortalContent) => void;
  /** Ce que le Socle sait de la collectivité, pour pré-remplir le modèle. */
  templateSource: StatementTemplateSource;
  /** La mention du pied de page — pour dire si elle mène ici. */
  accessibility: PortalTheme["accessibility"];
  /** Ouvre la mention du pied de page dans la vue « Composition ». */
  onEditMention: () => void;
}

const STATEMENT = PORTAL_CONTENTS[0];

/**
 * La vue « Contenus » : les pages de TEXTE du site, à côté de la page d'accueil
 * composée. Une seule aujourd'hui, la déclaration d'accessibilité ; les
 * actualités, prévues, restent grisées.
 *
 * Purement présentationnelle, comme le panneau du thème : le contenu lui est
 * donné, elle rend le suivant — l'autosauvegarde et la publication sont celles
 * du site (`PortalEditorPage`).
 */
export function ContentsPanel({
  statement,
  onStatementChange,
  templateSource,
  accessibility,
  onEditMention,
}: ContentsPanelProps) {
  const [confirmTemplate, setConfirmTemplate] = React.useState(false);
  const written = hasContentBody(statement);
  const linked = accessibility.declarationEnabled && accessibility.declarationLink;

  function applyTemplate() {
    onStatementChange({ body: accessibilityStatementTemplate(templateSource) });
    setConfirmTemplate(false);
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside
        aria-label="Contenus du site"
        className="flex w-[260px] shrink-0 flex-col gap-1 border-r border-border bg-background p-3"
      >
        <span className="px-2 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Contenus du site
        </span>
        {/* Un seul contenu ouvert aujourd'hui : l'entrée est une étiquette de
            l'élément affiché, pas encore un sélecteur. */}
        <div
          aria-current="true"
          className="flex items-start gap-2.5 rounded-lg bg-primary/[0.08] px-2.5 py-2"
        >
          <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] font-bold leading-tight">
              {STATEMENT.label} / {STATEMENT.tag}
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              {written ? "Rédigée" : "À rédiger"}
            </span>
          </span>
        </div>
        {/* Grisé, pas caché — motif du bloc « Actualités » de la palette. */}
        <div
          aria-disabled="true"
          title="Bientôt disponible"
          className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 opacity-50"
        >
          <Newspaper className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-bold leading-tight">Actualités</span>
            <span className="text-[11.5px] text-muted-foreground">Bientôt disponible</span>
          </span>
        </div>
      </aside>

      <div className="min-w-0 flex-1 overflow-auto bg-muted">
        <section
          aria-labelledby="contents-statement-title"
          className="mx-auto my-6 flex max-w-3xl flex-col gap-5 rounded-2xl border border-border bg-background p-6 shadow-socle-md"
        >
          <header className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="contents-statement-title" className="text-lg font-bold">
                {STATEMENT.label}
              </h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                {STATEMENT.tag}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Obligatoire pour un site public. Elle sera publiée sur votre site à l'adresse{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">{STATEMENT.path}</code>, avec
              le reste du site, quand vous cliquerez sur « Publier ».
            </p>
          </header>

          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-[12.5px]",
              linked ? "border-primary/30 bg-primary/[0.05]" : "border-amber-300 bg-amber-50 text-amber-900",
            )}
          >
            <span className="flex items-center gap-2">
              {linked ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
              {linked
                ? "La mention du pied de page mène à cette déclaration."
                : "La mention du pied de page ne mène pas à cette déclaration : activez son lien."}
            </span>
            <Button type="button" size="sm" variant="outline" onClick={onEditMention}>
              Régler la mention
              <ArrowRight />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant={written ? "outline" : "primary"}
              onClick={() => (written ? setConfirmTemplate(true) : applyTemplate())}
            >
              <FileText />
              {written ? "Repartir du modèle RGAA" : "Partir du modèle RGAA"}
            </Button>
            <span className="text-[12px] text-muted-foreground">
              La structure du modèle de la DINUM. Ce qui est entre crochets reste à écrire :
              l'état de conformité et les résultats viennent de votre audit.
            </span>
          </div>

          <MarkdownField
            id="contents-statement-body"
            label="Texte de la déclaration"
            value={statement.body}
            onChange={(body) => onStatementChange({ body })}
            rows={26}
            maxLength={MAX_CONTENT_BODY_LENGTH}
            placeholder="Écrivez la déclaration, ou partez du modèle RGAA."
          />
        </section>
      </div>

      <AlertDialog open={confirmTemplate} onOpenChange={setConfirmTemplate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remplacer la déclaration par le modèle ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le texte que vous avez écrit sera remplacé. Tant que vous n'avez pas publié,
              « Annuler » en haut de l'écran rend la dernière version publiée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder mon texte</AlertDialogCancel>
            <AlertDialogAction onClick={applyTemplate}>Remplacer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
