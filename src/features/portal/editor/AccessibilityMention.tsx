import { ArrowRight, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { MAX_DECLARATION_LENGTH, type PortalTheme } from "@/features/portal/portalTheme";

/**
 * La mention d'accessibilité — au pied de TOUTES les pages du site, pas
 * seulement de l'accueil : c'est une obligation d'un site public (RGAA,
 * article 47 de la loi du 11 février 2005).
 *
 * Elle se règle dans la vue « Composition », là où on la voit : un clic sur la
 * bande du bas du canevas ouvre son inspecteur. Mais ce n'est PAS une section —
 * elle ne se déplace pas, ne se supprime pas, n'appartient pas à la page
 * d'accueil. Ses réglages vivent dans le thème (`theme.accessibility`), qui
 * vaut pour tout le site.
 */

/** Le libellé du lien, tel que Nora l'affiche en français. */
export const STATEMENT_LINK_LABEL = "Déclaration d'accessibilité";

/**
 * Ce que le site affichera — la règle que l'API publique applique à la
 * frontière, rejouée ici pour que le canevas ne montre ni plus ni moins :
 *   - rien si la mention est masquée ;
 *   - le lien seulement s'il est demandé ET qu'une déclaration est écrite (le
 *     portail ne sert jamais un lien vers une page vide).
 */
export function mentionPreview(
  accessibility: PortalTheme["accessibility"],
  statementWritten: boolean,
): { text: string; link: boolean } | null {
  if (!accessibility.declarationEnabled) return null;
  const text = accessibility.declaration.trim();
  const link = accessibility.declarationLink && statementWritten;
  if (text === "" && !link) return null;
  return { text, link };
}

/**
 * La bande du bas du canevas. Même rendu que `AccessibilityNotice` chez Nora :
 * une ligne centrée, petite, sur la surface du thème.
 *
 * En édition, elle reste cliquable même quand le site n'affichera rien — sans
 * quoi une mention masquée ne pourrait plus être réaffichée depuis la page.
 */
export function AccessibilityMentionBlock({
  theme,
  statementWritten,
  selected,
  previewing,
  onSelect,
}: {
  theme: PortalTheme;
  statementWritten: boolean;
  selected: boolean;
  previewing: boolean;
  onSelect: () => void;
}) {
  const preview = mentionPreview(theme.accessibility, statementWritten);

  if (previewing) {
    if (preview === null) return null;
    return (
      <p
        className="px-6 py-4 text-center text-[length:var(--pt-tiny)] text-[color:var(--pt-muted)]"
        style={{ background: "var(--pt-surface)" }}
      >
        <MentionText text={preview.text} link={preview.link} />
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "relative block w-full px-6 py-4 text-center outline outline-2 -outline-offset-2 outline-transparent transition-[outline-color]",
        selected ? "outline-primary" : "hover:outline-dashed hover:outline-primary/45",
      )}
      style={{ background: "var(--pt-surface)" }}
    >
      {selected ? (
        <span className="absolute -top-3.5 left-2.5 z-10 rounded-full bg-primary px-2.5 py-1 text-[11.5px] font-bold text-primary-foreground shadow-socle-md">
          Mention d'accessibilité
        </span>
      ) : null}
      {preview === null ? (
        <span className="text-[12px] font-semibold text-muted-foreground">
          {theme.accessibility.declarationEnabled
            ? "Mention d'accessibilité vide — cliquez pour l'écrire"
            : "Mention d'accessibilité masquée — cliquez pour la régler"}
        </span>
      ) : (
        <span className="text-[length:var(--pt-tiny)] text-[color:var(--pt-muted)]">
          <MentionText text={preview.text} link={preview.link} />
        </span>
      )}
    </button>
  );
}

function MentionText({ text, link }: { text: string; link: boolean }) {
  return (
    <>
      {text}
      {text !== "" && link ? " · " : null}
      {/* Décoratif, comme la navigation de la maquette : la page existe chez
          Nora, pas dans l'éditeur. */}
      {link ? (
        <span className="font-semibold text-[color:var(--pt-ink)] underline">
          {STATEMENT_LINK_LABEL}
        </span>
      ) : null}
    </>
  );
}

/**
 * L'inspecteur de la mention — même gabarit que `SectionInspector`.
 *
 * ⚠️ Les champs d'une mention masquée sont MASQUÉS, pas remis à zéro (motif
 * `header.color`) : la réafficher doit retrouver son texte et son lien.
 */
export function AccessibilityMentionInspector({
  accessibility,
  statementWritten,
  onChange,
  onEditStatement,
  onClose,
}: {
  accessibility: PortalTheme["accessibility"];
  /** La déclaration (onglet « Contenus ») a-t-elle un texte ? */
  statementWritten: boolean;
  onChange: (accessibility: PortalTheme["accessibility"]) => void;
  /** Ouvre la déclaration dans l'onglet « Contenus ». */
  onEditStatement: () => void;
  onClose: () => void;
}) {
  const set = (patch: Partial<PortalTheme["accessibility"]>) =>
    onChange({ ...accessibility, ...patch });

  return (
    <div
      role="region"
      aria-label="Réglages de la mention d'accessibilité"
      className="absolute bottom-4 right-4 top-4 z-[5] flex w-[306px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-socle-lg"
    >
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold">Mention d'accessibilité</span>
          <span className="text-[11.5px] text-muted-foreground">
            Au pied de toutes les pages du site
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
        <ToggleRow
          id="mention-enabled"
          label="Afficher la mention"
          hint="Obligatoire pour un site public (RGAA) : elle figure au pied de chaque page — accueil, démarches, formulaires."
          checked={accessibility.declarationEnabled}
          onCheckedChange={(declarationEnabled) => set({ declarationEnabled })}
        />

        {accessibility.declarationEnabled ? (
          <>
            <Field
              label="Texte de la mention"
              htmlFor="mention-text"
              hint="Une phrase : l'état de conformité du site, tel que votre audit l'établit."
            >
              <Input
                id="mention-text"
                value={accessibility.declaration}
                maxLength={MAX_DECLARATION_LENGTH}
                placeholder="Ex. Accessibilité : partiellement conforme"
                onChange={(event) => set({ declaration: event.target.value })}
              />
            </Field>

            <ToggleRow
              id="mention-link"
              label="Lien vers la déclaration"
              hint={`Ajoute le lien « ${STATEMENT_LINK_LABEL} », qui mène à la déclaration rédigée dans l'onglet Contenus.`}
              checked={accessibility.declarationLink}
              onCheckedChange={(declarationLink) => set({ declarationLink })}
            />

            {accessibility.declarationLink && !statementWritten ? (
              <div className="flex flex-col gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[12px] leading-snug text-amber-900">
                <p className="flex gap-2">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    La déclaration n'est pas encore rédigée : le lien n'apparaîtra sur le site
                    qu'une fois la déclaration écrite et publiée.
                  </span>
                </p>
                <Button type="button" size="sm" variant="outline" onClick={onEditStatement}>
                  Rédiger la déclaration
                  <ArrowRight />
                </Button>
              </div>
            ) : null}

            {accessibility.declarationLink && statementWritten ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="self-start"
                onClick={onEditStatement}
              >
                Modifier la déclaration
                <ArrowRight />
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2.5">
        <label htmlFor={id} className="text-[12.5px] font-bold">
          {label}
        </label>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
    </div>
  );
}
