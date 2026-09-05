import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  GRID_COLUMNS,
  MAX_SHORTCUTS,
  SECTION_LABELS,
  type ActusSection,
  type DemarchesSection,
  type PortalSection,
  type RechercheSection,
  type TextAlign,
  type TexteSection,
} from "@/features/portal/portalPage";
import type { PortalCatalogueEntry } from "@/features/portal/catalogue";
import { ProcedurePickList } from "./ProcedurePickList";

export interface SectionInspectorProps {
  section: PortalSection;
  /** Position 0-based de la section dans la page — affichée 1-based. */
  index: number;
  total: number;
  catalogue: PortalCatalogueEntry[];
  onChange: (section: PortalSection) => void;
  onClose: () => void;
}

const TEXT_ALIGN_OPTIONS: { value: TextAlign; label: string }[] = [
  { value: "left", label: "Gauche" },
  { value: "center", label: "Centré" },
];

/**
 * Panneau flottant d'édition de la section sélectionnée. Chaque champ est
 * contrôlé : l'inspecteur ne détient aucun état propre, il remonte un
 * `PortalSection` complet à chaque frappe — le parent l'enregistre via
 * `replaceSection`.
 */
export function SectionInspector({ section, index, total, catalogue, onChange, onClose }: SectionInspectorProps) {
  const isActus = section.kind === "actus";

  return (
    <div className="absolute bottom-4 right-4 top-4 z-[5] flex w-[306px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-socle-lg">
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold">{SECTION_LABELS[section.kind]}</span>
          <span className="text-[11.5px] text-muted-foreground">
            Position {index + 1} / {total} sur la page
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le panneau"
          className="flex size-[26px] shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-[18px] overflow-auto p-4">
        <div className={cn("flex flex-col gap-[18px]", isActus && "pointer-events-none opacity-50")} aria-disabled={isActus || undefined}>
          <Field label="Titre affiché" htmlFor="insp-title">
            <Input
              id="insp-title"
              value={section.title}
              onChange={(e) => onChange({ ...section, title: e.target.value })}
            />
          </Field>

          {section.kind === "recherche" ? (
            <RechercheFields section={section} catalogue={catalogue} onChange={onChange} />
          ) : null}
          {section.kind === "demarches" ? (
            <DemarchesFields section={section} catalogue={catalogue} onChange={onChange} />
          ) : null}
          {section.kind === "actus" ? <ActusFields section={section} /> : null}
          {section.kind === "compte" ? (
            <Field label="Accroche" htmlFor="insp-subtitle">
              <Input
                id="insp-subtitle"
                value={section.subtitle}
                onChange={(e) => onChange({ ...section, subtitle: e.target.value })}
              />
            </Field>
          ) : null}
          {section.kind === "texte" ? <TexteFields section={section} onChange={onChange} /> : null}
        </div>

        {isActus ? (
          <p className="text-xs font-medium text-primary">
            Bientôt disponible — les actualités ne sont pas encore éditables.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ToggleField({
  id,
  label,
  checked,
  onCheckedChange,
  hint,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-[22px] items-center justify-between gap-2.5">
        <label htmlFor={id} className="text-[12.5px] font-bold">
          {label}
        </label>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

function RechercheFields({
  section,
  catalogue,
  onChange,
}: {
  section: RechercheSection;
  catalogue: PortalCatalogueEntry[];
  onChange: (section: PortalSection) => void;
}) {
  return (
    <>
      <Field label="Sous-titre" htmlFor="insp-subtitle">
        <Input
          id="insp-subtitle"
          value={section.subtitle}
          onChange={(e) => onChange({ ...section, subtitle: e.target.value })}
        />
      </Field>
      <Field label="Texte du champ" htmlFor="insp-placeholder">
        <Input
          id="insp-placeholder"
          value={section.placeholder}
          onChange={(e) => onChange({ ...section, placeholder: e.target.value })}
        />
      </Field>
      <ToggleField
        id="insp-shortcuts"
        label="Démarches fréquentes"
        checked={section.showShortcuts}
        onCheckedChange={(checked) => onChange({ ...section, showShortcuts: checked })}
        hint="Affiche jusqu'à 4 raccourcis sous le champ."
      />
      {section.showShortcuts ? (
        <ProcedurePickList
          entries={catalogue}
          selected={section.shortcuts}
          max={MAX_SHORTCUTS}
          activeLabel="Raccourci"
          inactiveLabel="Ajouter"
          onToggle={(id) => {
            const has = section.shortcuts.includes(id);
            const next = has ? section.shortcuts.filter((s) => s !== id) : [...section.shortcuts, id];
            onChange({ ...section, shortcuts: next });
          }}
        />
      ) : null}
    </>
  );
}

function DemarchesFields({
  section,
  catalogue,
  onChange,
}: {
  section: DemarchesSection;
  catalogue: PortalCatalogueEntry[];
  onChange: (section: PortalSection) => void;
}) {
  return (
    <>
      <Field label="Colonnes">
        <SegmentedControl
          aria-label="Colonnes"
          value={String(section.columns)}
          onChange={(value) => onChange({ ...section, columns: Number(value) as 2 | 3 | 4 })}
          options={GRID_COLUMNS.map((n) => ({ value: String(n), label: String(n) }))}
        />
      </Field>
      <ToggleField
        id="insp-pinned-first"
        label="Démarches à la une en premier"
        checked={section.pinnedFirst}
        onCheckedChange={(checked) => onChange({ ...section, pinnedFirst: checked })}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-bold">Mise en avant</span>
        <ProcedurePickList
          entries={catalogue}
          selected={section.pinned}
          onToggle={(id) => {
            const has = section.pinned.includes(id);
            const next = has ? section.pinned.filter((p) => p !== id) : [...section.pinned, id];
            onChange({ ...section, pinned: next });
          }}
        />
        <span className="text-[11px] text-muted-foreground">
          Le catalogue et les formulaires se gèrent dans l'outil Démarches. Ici vous choisissez seulement ce
          qui remonte sur l'accueil.
        </span>
      </div>
    </>
  );
}

/** Champs de la maquette, rendus non interactifs — le panneau entier est grisé par l'appelant. */
function ActusFields({ section }: { section: ActusSection }) {
  return (
    <>
      <Field label="Disposition">
        <SegmentedControl
          aria-label="Disposition"
          value={section.layout}
          onChange={() => {}}
          options={[
            { value: "grid", label: "Grille" },
            { value: "list", label: "Liste" },
          ]}
        />
      </Field>
      <Field label="Articles affichés">
        <SegmentedControl
          aria-label="Articles affichés"
          value={String(section.count)}
          onChange={() => {}}
          options={GRID_COLUMNS.map((n) => ({ value: String(n), label: String(n) }))}
        />
      </Field>
      <ToggleField id="insp-actus-dates" label="Afficher les dates" checked={section.showDates} onCheckedChange={() => {}} />
    </>
  );
}

function TexteFields({
  section,
  onChange,
}: {
  section: TexteSection;
  onChange: (section: PortalSection) => void;
}) {
  return (
    <>
      <Field label="Paragraphe" htmlFor="insp-body">
        <textarea
          id="insp-body"
          value={section.body}
          onChange={(e) => onChange({ ...section, body: e.target.value })}
          rows={4}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>
      <Field label="Alignement">
        <SegmentedControl
          aria-label="Alignement"
          value={section.align}
          onChange={(align) => onChange({ ...section, align })}
          options={TEXT_ALIGN_OPTIONS}
        />
      </Field>
    </>
  );
}
