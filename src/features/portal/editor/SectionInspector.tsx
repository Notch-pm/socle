import * as React from "react";
import { ChevronDown, ChevronUp, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  FOOTER_COLUMNS,
  GRID_COLUMNS,
  HEX_COLOR,
  IMAGE_URL,
  MAX_SHORTCUTS,
  SECTION_LABELS,
  createContactSection,
  createSection,
  type ActusSection,
  type ContactSource,
  type DemarchesSection,
  type RechercheTextColor,
  type FooterColumns,
  type FooterSection,
  type PortalSection,
  type RechercheSection,
  type TextAlign,
  type TexteImageLayout,
  type TexteImageSection,
  type TexteSection,
} from "@/features/portal/portalPage";
import type { PortalCatalogueEntry } from "@/features/portal/catalogue";
import { ProcedurePickList } from "./ProcedurePickList";
import { SectionTranslations } from "./SectionTranslations";

export interface SectionInspectorProps {
  section: PortalSection;
  /** Position 0-based de la section dans la page — affichée 1-based. */
  index: number;
  total: number;
  catalogue: PortalCatalogueEntry[];
  /** Pour pré-remplir un sous-bloc « Contact et horaires » dans un pied de page. */
  contact: ContactSource;
  /**
   * Les langues activées par l'organisation principale, français compris. Une
   * seule langue : aucun bloc de traduction n'apparaît.
   */
  languages: readonly string[];
  /** L'organisation dont le crédit paie la traduction automatique. */
  organizationId: string;
  onChange: (section: PortalSection) => void;
  /** Retire la section de la page. Sans confirmation : c'est un brouillon, « Annuler » le rend. */
  onRemove: () => void;
  onClose: () => void;
}

const TEXT_ALIGN_OPTIONS: { value: TextAlign; label: string }[] = [
  { value: "left", label: "Gauche" },
  { value: "center", label: "Centré" },
];

/**
 * L'ordre des deux moitiés, nommé par ce qui vient EN PREMIER — le mot que
 * l'agent cherche quand il veut « l'image à gauche » comme quand il regarde la
 * page sur son téléphone.
 */
const TEXTE_IMAGE_LAYOUT_OPTIONS: { value: TexteImageLayout; label: string }[] = [
  { value: "text-first", label: "Texte puis image" },
  { value: "image-first", label: "Image puis texte" },
];

/**
 * Panneau flottant d'édition de la section sélectionnée. Chaque champ est
 * contrôlé : l'inspecteur ne détient aucun état propre, il remonte un
 * `PortalSection` complet à chaque frappe — le parent l'enregistre via
 * `replaceSection`.
 */
export function SectionInspector({
  section,
  index,
  total,
  catalogue,
  contact,
  languages,
  organizationId,
  onChange,
  onRemove,
  onClose,
}: SectionInspectorProps) {
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
          <Field
            label={
              section.kind === "footer" || section.kind === "texte-image"
                ? "Titre (facultatif)"
                : "Titre affiché"
            }
            htmlFor="insp-title"
          >
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
          {section.kind === "texte-image" ? (
            <TexteImageFields section={section} onChange={onChange} />
          ) : null}
          {section.kind === "footer" ? (
            <FooterFields
              section={section}
              contact={contact}
              languages={languages}
              organizationId={organizationId}
              onChange={onChange}
            />
          ) : null}

          {/* En bas : sous tous les textes français que ce bloc traduit. */}
          <SectionTranslations
            section={section}
            languages={languages}
            organizationId={organizationId}
            idPrefix={`insp-tr-${section.id}`}
            onChange={onChange}
          />
        </div>

        {isActus ? (
          <p className="text-xs font-medium text-primary">
            Bientôt disponible — les actualités ne sont pas encore éditables.
          </p>
        ) : null}
      </div>

      {/* Hors du bloc grisé des actualités : on doit pouvoir retirer un bloc
          qu'on ne peut pas éditer. Et hors du canevas : la pastille du bloc se
          réduit avec la page, ce bouton non. */}
      <div className="border-t border-border px-4 py-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRemove}
          className="w-full text-destructive hover:border-destructive hover:bg-destructive/5 hover:text-destructive"
        >
          <Trash2 />
          Supprimer la section
        </Button>
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
      <RechercheImageFields section={section} onChange={onChange} />
    </>
  );
}

/**
 * L'image de fond du bloc de recherche, ses deux options, et l'habillage des
 * textes posés dessus (couleur, ombre portée).
 *
 * ⚠️ Ces réglages n'apparaissent **qu'une fois une adresse saisie** :
 * ils n'habillent rien tant qu'il n'y a pas d'image, et un réglage sans effet
 * visible se lit comme un réglage cassé (motif `header.color`, masqué tant que
 * le bandeau est blanc). Ils sont masqués, pas remis à zéro : effacer l'adresse
 * puis en recoller une rend le bandeau tel qu'il était.
 */
function RechercheImageFields({
  section,
  onChange,
}: {
  section: RechercheSection;
  onChange: (section: PortalSection) => void;
}) {
  const url = section.imageUrl.trim();
  const urlError = url !== "" && !IMAGE_URL.test(url);
  const hasImage = url !== "" && !urlError;
  return (
    <>
      <Field
        label="Image de fond"
        htmlFor="insp-recherche-image"
        hint="Lien https vers un fichier déjà en ligne. L'image recouvre tout le bloc, telle quelle : réglez ensuite la couleur et l'ombre des textes pour qu'ils restent lisibles."
        error={urlError ? "Adresse attendue : https://…" : undefined}
      >
        <Input
          id="insp-recherche-image"
          value={section.imageUrl}
          onChange={(e) => onChange({ ...section, imageUrl: e.target.value })}
          aria-invalid={urlError}
          placeholder="https://"
        />
      </Field>
      {hasImage ? (
        <>
          <ToggleField
            id="insp-recherche-image-full"
            label="Pleine largeur"
            checked={section.imageFullWidth}
            onCheckedChange={(checked) => onChange({ ...section, imageFullWidth: checked })}
            hint="L'image va d'un bord à l'autre de la page, comme un bandeau."
          />
          <ToggleField
            id="insp-recherche-image-fixed"
            label="Image fixe"
            checked={section.imageFixed}
            onCheckedChange={(checked) => onChange({ ...section, imageFixed: checked })}
            hint="L'image ne bouge pas quand l'usager fait défiler la page. Effet ignoré par certains navigateurs mobiles, où l'image défile normalement."
          />
          <Field label="Couleur du titre et du sous-titre">
            <SegmentedControl
              aria-label="Couleur du titre et du sous-titre"
              value={section.textColor}
              onChange={(value) => onChange({ ...section, textColor: value as RechercheTextColor })}
              options={[
                { value: "theme", label: "Couleur du thème" },
                { value: "white", label: "Blanc" },
              ]}
            />
          </Field>
          <ToggleField
            id="insp-recherche-text-shadow"
            label="Ombre portée"
            checked={section.textShadow}
            onCheckedChange={(checked) => onChange({ ...section, textShadow: checked })}
            hint="Un halo autour du titre et du sous-titre, pour qu'ils se détachent d'une image aux couleurs variées."
          />
        </>
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
      <ToggleField
        id="insp-audience-filter"
        label="Filtre « Je suis… »"
        checked={section.audienceFilter}
        onCheckedChange={(checked) => onChange({ ...section, audienceFilter: checked })}
        hint="Citoyen, entreprise, association — d'après les publics de l'étape « Informations demandeur ». Se cumule avec le filtre par organisme, et ne s'affiche que si les démarches visent plusieurs publics."
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

/**
 * Texte et image. L'adresse de l'image est une URL libre — le Socle
 * l'enregistre et la publie, il n'héberge pas le fichier (motif
 * `organizations.logo_url`). Le champ le SIGNALE quand la forme n'est pas
 * acceptée plutôt que de laisser découvrir au rechargement que l'image a
 * disparu : `parsePortalPage` écarte ce qui n'est pas une `https` absolue.
 */
function TexteImageFields({
  section,
  onChange,
}: {
  section: TexteImageSection;
  onChange: (section: PortalSection) => void;
}) {
  const url = section.imageUrl.trim();
  const urlError = url !== "" && !IMAGE_URL.test(url);
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
      <Field
        label="Adresse de l'image"
        htmlFor="insp-image-url"
        hint="Lien https vers un fichier déjà en ligne, ex. https://…/visuel.jpg"
        error={urlError ? "Adresse attendue : https://…" : undefined}
      >
        <Input
          id="insp-image-url"
          value={section.imageUrl}
          onChange={(e) => onChange({ ...section, imageUrl: e.target.value })}
          aria-invalid={urlError}
          placeholder="https://"
        />
      </Field>
      <Field
        label="Description de l'image"
        htmlFor="insp-image-alt"
        hint="Lue par les synthèses vocales, affichée si l'image ne charge pas. À laisser vide si l'image est purement décorative."
      >
        <Input
          id="insp-image-alt"
          value={section.alt}
          onChange={(e) => onChange({ ...section, alt: e.target.value })}
        />
      </Field>
      <Field label="Ordre">
        <SegmentedControl
          aria-label="Ordre"
          value={section.layout}
          onChange={(layout) => onChange({ ...section, layout })}
          options={TEXTE_IMAGE_LAYOUT_OPTIONS}
        />
      </Field>
    </>
  );
}

const FOOTER_COLUMN_OPTIONS = FOOTER_COLUMNS.map((n) => ({ value: String(n), label: String(n) }));

/**
 * Saisie d'une couleur : nuancier natif + notation hexadécimale, les deux
 * liés. Le champ texte garde un brouillon local — seule exception au
 * « l'inspecteur ne détient aucun état » : une couleur se tape caractère par
 * caractère, et n'est remontée qu'une fois bien formée. Sans ce brouillon, le
 * champ refuserait chaque frappe intermédiaire.
 */
function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  const valid = HEX_COLOR.test(draft.trim().toLowerCase());
  return (
    <Field label={label} htmlFor={id} hint="Notation hexadécimale, ex. #0f1f18" error={valid ? undefined : "Couleur attendue : #rrggbb"}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} — nuancier`}
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-input bg-background p-1"
        />
        <Input
          id={id}
          value={draft}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            const normalized = next.trim().toLowerCase();
            if (HEX_COLOR.test(normalized)) onChange(normalized);
          }}
          aria-invalid={!valid}
        />
      </div>
    </Field>
  );
}

/**
 * Le pied de page : sa couleur, ses colonnes, et ses sous-blocs — ajoutés,
 * édités, ordonnés et retirés ICI, pas par glisser-déposer imbriqué. La
 * colonne d'un sous-bloc découle de son rang.
 */
function FooterFields({
  section,
  contact,
  languages,
  organizationId,
  onChange,
}: {
  section: FooterSection;
  contact: ContactSource;
  languages: readonly string[];
  organizationId: string;
  onChange: (section: PortalSection) => void;
}) {
  const children = section.children;
  const setChildren = (next: TexteSection[]) => onChange({ ...section, children: next });
  const replaceChild = (child: TexteSection) =>
    setChildren(children.map((c) => (c.id === child.id ? child : c)));
  const shiftChild = (index: number, direction: -1 | 1) => {
    const to = index + direction;
    if (to < 0 || to >= children.length) return;
    const next = [...children];
    const [moved] = next.splice(index, 1);
    next.splice(to, 0, moved);
    setChildren(next);
  };

  return (
    <>
      <ColorField
        id="insp-footer-background"
        label="Couleur de fond"
        value={section.background}
        onChange={(background) => onChange({ ...section, background })}
      />
      <Field label="Colonnes">
        <SegmentedControl
          aria-label="Colonnes"
          value={String(section.columns)}
          onChange={(value) => onChange({ ...section, columns: Number(value) as FooterColumns })}
          options={FOOTER_COLUMN_OPTIONS}
        />
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-[12.5px] font-bold">Blocs du pied de page</span>
        {children.length === 0 ? (
          <span className="text-xs text-muted-foreground">Aucun bloc pour l'instant.</span>
        ) : null}
        {children.map((child, i) => (
          <div key={child.id} className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
            <div className="flex items-center gap-1">
              <Input
                aria-label="Titre du bloc"
                value={child.title}
                onChange={(e) => replaceChild({ ...child, title: e.target.value })}
                className="h-8"
              />
              <button
                type="button"
                aria-label="Monter le bloc"
                disabled={i === 0}
                onClick={() => shiftChild(i, -1)}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Descendre le bloc"
                disabled={i === children.length - 1}
                onClick={() => shiftChild(i, 1)}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                <ChevronDown className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Retirer le bloc"
                onClick={() => setChildren(children.filter((c) => c.id !== child.id))}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <textarea
              aria-label="Texte du bloc"
              value={child.body}
              onChange={(e) => replaceChild({ ...child, body: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {/* Chaque sous-bloc a ses propres textes, donc ses propres
                traductions — et son propre appel : traduire une colonne de pied
                de page en même temps que le titre du bandeau ferait un prompt
                qui parle de deux choses. */}
            <SectionTranslations
              section={child}
              languages={languages}
              organizationId={organizationId}
              idPrefix={`insp-tr-${child.id}`}
              onChange={(next) => replaceChild(next as TexteSection)}
            />
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setChildren([...children, createContactSection(contact)])}
          >
            Contact et horaires
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setChildren([...children, createSection("texte")])}
          >
            Bandeau texte
          </Button>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Les blocs se répartissent dans les colonnes, dans l'ordre.
        </span>
      </div>
    </>
  );
}
