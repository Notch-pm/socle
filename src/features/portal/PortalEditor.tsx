import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ArrowLeft, Eye, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  SECTION_LABELS,
  type ContactSource,
  type PaletteKind,
  type PortalPage,
  type PortalSection,
} from "@/features/portal/portalPage";
import {
  appendIndex,
  dropIndex,
  insertSectionAt,
  moveSectionToIndex,
  removeSection,
  replaceSection,
  resolveDropPosition,
  shiftSection,
} from "@/features/portal/portalReorder";
import type { PortalCatalogueEntry } from "@/features/portal/catalogue";
import { DEVICE_OPTIONS, type Device } from "@/features/portal/editor/device";
import { sectionFromPaletteKind } from "@/features/portal/editor/paletteSection";
import { CANVAS_DROP_ID, PortalCanvas } from "@/features/portal/editor/PortalCanvas";
import { SectionInspector } from "@/features/portal/editor/SectionInspector";
import { SectionPalette } from "@/features/portal/editor/SectionPalette";

export interface PortalEditorProps {
  organizationName: string;
  /** Le logo de la collectivité, affiché dans le bandeau de la maquette. */
  organizationLogoUrl: string | null;
  /** Id de l'organisation principale — la traduction automatique s'y impute. */
  organizationId: string;
  /**
   * Les langues activées par la collectivité, français compris.
   *
   * ⚠️ CE N'EST PAS UNE DONNÉE DE LA PAGE : comme l'appareil prévisualisé, c'est
   * un contexte d'édition. Elles viennent du paramétrage de l'organisation, pas
   * du brouillon — et surtout pas des clés de `translations` : une langue
   * activée mais pas encore traduite doit apparaître, c'est même le cas de
   * départ.
   */
  languages: readonly string[];
  /** Le brouillon courant — possédé par le parent, pas par l'éditeur. */
  page: PortalPage;
  /** Toute modification : ajout, déplacement, édition, retrait d'une section. */
  onChange: (page: PortalPage) => void;
  catalogue: PortalCatalogueEntry[];
  contact: ContactSource;
  statusLine: string;
  statusIsError?: boolean;
  onPublish: () => void;
  onDiscard: () => void;
  onClose: () => void;
  /** Désactive Annuler/Publier pendant une mutation en cours. */
  busy?: boolean;
}

type EditorView = "composition" | "contenus" | "theme";

/** Ce qu'on tient pendant un glisser : quoi, et où ça va tomber. */
interface DragState {
  /** Id de la section saisie ; `null` pour un bloc venu de la palette. */
  id: string | null;
  label: string;
  /** Index de destination sur la liste courante — l'ombre est dessinée là. */
  dropIndex: number | null;
}

/**
 * La zone de dépôt racine couvre toute la liste : sans cela, un bloc lâché
 * sous la dernière section n'irait nulle part. Mais elle recouvre aussi chaque
 * section — on ne la retient que si aucune section n'est survolée.
 */
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const collisions = within.length > 0 ? within : rectIntersection(args);
  const specific = collisions.filter((c) => c.id !== CANVAS_DROP_ID);
  return specific.length > 0 ? specific : collisions;
};

/**
 * Shell plein écran de l'éditeur CMS du portail usagers — vue « Composition ».
 * Purement présentationnel : aucun accès réseau, l'état de composition
 * (`page`) est possédé par le parent, seule l'interface locale (sélection,
 * appareil, palette, aperçu, glisser en cours) vit ici.
 */
export function PortalEditor({
  organizationName,
  organizationLogoUrl,
  organizationId,
  languages,
  page,
  onChange,
  catalogue,
  contact,
  statusLine,
  statusIsError,
  onPublish,
  onDiscard,
  onClose,
  busy,
}: PortalEditorProps) {
  const [device, setDevice] = React.useState<Device>("bureau");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = React.useState(true);
  const [previewing, setPreviewing] = React.useState(false);
  const [drag, setDrag] = React.useState<DragState | null>(null);

  // 5 px avant qu'un glisser ne commence : c'est ce qui laisse passer le clic
  // sur un bloc (sélection) et sur un bouton de la palette (ajout).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const sections = page.sections;
  const selected = sections.find((s) => s.id === selectedId) ?? null;

  function setSections(next: PortalSection[]) {
    onChange({ ...page, sections: next });
  }

  function handleRemove(id: string) {
    setSections(removeSection(sections, id));
    setSelectedId((current) => (current === id ? null : current));
  }

  // Suppr ou Retour arrière retire le bloc sélectionné — sauf quand on tape
  // dans un champ de l'inspecteur, où ces touches gardent leur sens.
  React.useEffect(() => {
    if (!selectedId || previewing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      event.preventDefault();
      handleRemove(selectedId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // `handleRemove` lit `sections` du rendu courant : l'effet se réabonne à
    // chaque changement de sélection ou de page, c'est voulu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, previewing, sections]);

  /** Où le bloc tomberait si on le lâchait maintenant — `null` : nulle part. */
  function targetIndex(event: DragOverEvent | DragEndEvent): number | null {
    const { active, over } = event;
    if (!over) return null;
    if (over.id === CANVAS_DROP_ID) return sections.length;
    const position = resolveDropPosition(active.rect.current.translated, over.rect);
    return dropIndex(sections, String(over.id), position);
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { palette?: boolean; label?: string } | undefined;
    if (data?.palette) {
      setDrag({ id: null, label: data.label ?? "Bloc", dropIndex: null });
      return;
    }
    const id = String(event.active.id);
    const section = sections.find((s) => s.id === id);
    setDrag({ id, label: section ? SECTION_LABELS[section.kind] : "Section", dropIndex: null });
  }

  function handleDragOver(event: DragOverEvent) {
    const index = targetIndex(event);
    setDrag((current) =>
      current && current.dropIndex !== index ? { ...current, dropIndex: index } : current,
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const index = targetIndex(event);
    setDrag(null);
    const data = event.active.data.current as { palette?: boolean; kind?: PaletteKind } | undefined;
    if (data?.palette && data.kind) {
      const section = sectionFromPaletteKind(data.kind, contact);
      // Lâché hors de toute zone : en fin de page, comme un clic.
      setSections(insertSectionAt(sections, section, index ?? appendIndex(sections, section)));
      setSelectedId(section.id);
      return;
    }
    if (index === null) return;
    const next = moveSectionToIndex(sections, String(event.active.id), index);
    // Déposé sur sa propre place : rien n'a changé, on ne le dit pas au parent —
    // sans quoi une sauvegarde partirait pour un brouillon identique.
    if (next !== sections) setSections(next);
  }

  function handleAddFromPalette(section: PortalSection) {
    setSections(insertSectionAt(sections, section, appendIndex(sections, section)));
    setSelectedId(section.id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border px-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Retour"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13.5px] font-bold">Site de démarches — {organizationName}</span>
          <span className={cn("truncate text-[11.5px]", statusIsError ? "text-destructive" : "text-muted-foreground")}>
            {statusLine}
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <SegmentedControl<EditorView>
            aria-label="Vue de l'éditeur"
            value="composition"
            onChange={() => {}}
            options={[
              { value: "composition", label: "Composition" },
              { value: "contenus", label: "Contenus", disabled: true, title: "Bientôt disponible" },
              { value: "theme", label: "Thème", disabled: true, title: "Bientôt disponible" },
            ]}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <SegmentedControl<Device>
            aria-label="Appareil"
            size="sm"
            value={device}
            onChange={setDevice}
            options={DEVICE_OPTIONS}
          />
          <Button type="button" variant="outline" size="sm" onClick={onDiscard} disabled={busy}>
            <RotateCcw />
            Annuler
          </Button>
          <Button
            type="button"
            variant={previewing ? "primary" : "outline"}
            size="sm"
            aria-pressed={previewing}
            onClick={() => setPreviewing((v) => !v)}
          >
            <Eye />
            {previewing ? "Quitter l'aperçu" : "Prévisualiser"}
          </Button>
          <Button type="button" size="sm" onClick={onPublish} disabled={busy}>
            Publier
          </Button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDrag(null)}
        >
          <PortalCanvas
            organizationName={organizationName}
            organizationLogoUrl={organizationLogoUrl}
            languages={languages}
            sections={sections}
            device={device}
            selectedId={selectedId}
            catalogue={catalogue}
            paletteOpen={paletteOpen}
            previewing={previewing}
            dropIndex={drag?.dropIndex ?? null}
            dropLabel={drag?.label ?? null}
            onSelect={setSelectedId}
            onShift={(id, direction) => setSections(shiftSection(sections, id, direction))}
            onRemove={handleRemove}
            onOpenPalette={() => setPaletteOpen(true)}
          />

          {previewing ? null : (
            <SectionPalette
              open={paletteOpen}
              onOpenChange={setPaletteOpen}
              contact={contact}
              onAdd={handleAddFromPalette}
            />
          )}

          {previewing || !selected ? null : (
            <SectionInspector
              section={selected}
              index={sections.findIndex((s) => s.id === selected.id)}
              total={sections.length}
              catalogue={catalogue}
              contact={contact}
              languages={languages}
              organizationId={organizationId}
              onChange={(next) => setSections(replaceSection(sections, next))}
              onRemove={() => handleRemove(selected.id)}
              onClose={() => setSelectedId(null)}
            />
          )}

          {/* Le fantôme ne sert qu'aux blocs venus de la palette : une
              section existante se déplace elle-même, l'ombre dit où elle va.
              `dropAnimation={null}` : au dépôt, le fantôme disparaît sur
              place au lieu de revenir vers la palette — le bloc est déjà
              dans la page, l'animation de retour mentirait. */}
          <DragOverlay dropAnimation={null}>
            {drag && drag.id === null ? (
              <div className="rounded-lg border border-primary/40 bg-background px-3 py-2 text-sm shadow-socle-md">
                {drag.label}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
