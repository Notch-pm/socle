import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ArrowLeft, Eye, LayoutGrid, Newspaper, RotateCcw, SlidersHorizontal, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import logo from "@/assets/logo-edilumen.svg";
import type { ContactSource, PaletteKind, PortalPage, PortalSection } from "@/features/portal/portalPage";
import {
  insertSection,
  moveSection,
  removeSection,
  replaceSection,
  resolveDropPosition,
  shiftSection,
} from "@/features/portal/portalReorder";
import type { PortalCatalogueEntry } from "@/features/portal/catalogue";
import { DEVICE_OPTIONS, type Device } from "@/features/portal/editor/device";
import { sectionFromPaletteKind } from "@/features/portal/editor/paletteSection";
import { PortalCanvas } from "@/features/portal/editor/PortalCanvas";
import { SectionInspector } from "@/features/portal/editor/SectionInspector";
import { SectionPalette } from "@/features/portal/editor/SectionPalette";

export interface PortalEditorProps {
  organizationName: string;
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

/**
 * Shell plein écran de l'éditeur CMS du portail usagers — vue « Composition ».
 * Purement présentationnel : aucun accès réseau, l'état de composition
 * (`page`) est possédé par le parent, seule l'interface locale (sélection,
 * appareil, palette, aperçu) vit ici.
 */
export function PortalEditor({
  organizationName,
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
  const [dragLabel, setDragLabel] = React.useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const sections = page.sections;
  const selected = sections.find((s) => s.id === selectedId) ?? null;

  function setSections(next: PortalSection[]) {
    onChange({ ...page, sections: next });
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { palette?: boolean; label?: string } | undefined;
    setDragLabel(data?.palette ? (data.label ?? "Bloc") : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragLabel(null);
    const { active, over } = event;
    const data = active.data.current as { palette?: boolean; kind?: PaletteKind } | undefined;
    if (data?.palette && data.kind) {
      const overId = over?.id != null ? String(over.id) : null;
      const position = resolveDropPosition(active.rect.current.translated, over?.rect ?? null);
      const section = sectionFromPaletteKind(data.kind, contact);
      setSections(insertSection(sections, section, overId, position));
      setSelectedId(section.id);
      return;
    }
    if (!over || active.id === over.id) return;
    setSections(moveSection(sections, String(active.id), String(over.id)));
  }

  function handleAddFromPalette(section: PortalSection) {
    setSections(insertSection(sections, section, null));
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
        <img src={logo} alt="Edilumen" className="h-5 shrink-0" />
        <span className="h-[22px] w-px shrink-0 bg-border" aria-hidden="true" />
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

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Sections de l'éditeur" className="flex w-[52px] shrink-0 flex-col items-center gap-1.5 bg-sidebar py-2.5">
          <RailTile icon={LayoutGrid} label="Composition" active />
          <RailTile icon={Newspaper} label="Actualités" />
          <RailTile icon={SlidersHorizontal} label="Thème" />
          <RailTile icon={Users} label="Usagers" />
        </nav>

        <div className="relative flex min-h-0 flex-1">
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <PortalCanvas
              organizationName={organizationName}
              sections={sections}
              device={device}
              selectedId={selectedId}
              catalogue={catalogue}
              paletteOpen={paletteOpen}
              previewing={previewing}
              onSelect={setSelectedId}
              onShift={(id, direction) => setSections(shiftSection(sections, id, direction))}
              onRemove={(id) => {
                setSections(removeSection(sections, id));
                setSelectedId((current) => (current === id ? null : current));
              }}
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
                onChange={(next) => setSections(replaceSection(sections, next))}
                onClose={() => setSelectedId(null)}
              />
            )}

            <DragOverlay>
              {dragLabel ? (
                <div className="rounded-lg border border-primary/40 bg-background px-3 py-2 text-sm shadow-socle-md">
                  {dragLabel}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>
    </div>
  );
}

function RailTile({
  icon: Icon,
  label,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={active ? undefined : "Bientôt disponible"}
      aria-label={label}
      aria-disabled={!active || undefined}
      onClick={() => {}}
      className={cn(
        "flex size-9 items-center justify-center rounded-lg transition-colors",
        active ? "bg-sidebar-active text-primary" : "cursor-not-allowed text-sidebar-foreground/50 opacity-50",
      )}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}
