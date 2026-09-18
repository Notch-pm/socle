import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { fontById, PORTAL_FONTS, type FontId } from "@/features/portal/portalFonts";
import {
  applyPreset,
  presetName,
  PRESETS,
  type PortalTheme,
} from "@/features/portal/portalTheme";
import {
  contrastRows,
  formatRatio,
  resolveThemeColors,
  THEME_RADIUS_PX,
  type ThemeBranding,
} from "@/features/portal/themeStyle";

export interface ThemePanelProps {
  theme: PortalTheme;
  branding: ThemeBranding | null;
  onChange: (theme: PortalTheme) => void;
  /** Simulation « texte agrandi » — état de l'éditeur, jamais enregistré. */
  largeText: boolean;
  onLargeTextChange: (value: boolean) => void;
}

/** Un titre de groupe, avec le filet qui le sépare du précédent. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-[12.5px] font-extrabold">{title}</h3>
      {children}
    </section>
  );
}

/** Une ligne de réglage : son étiquette, son contrôle, et son aide. */
function Row({
  label,
  hint,
  htmlFor,
  control,
  children,
}: {
  label: string;
  hint?: string;
  /**
   * Champ de saisie que cette étiquette désigne — elle devient alors un vrai
   * `<label>`. Les segments et les interrupteurs, eux, portent leur propre
   * `aria-label` : ce ne sont pas des champs de formulaire.
   */
  htmlFor?: string;
  /** Contrôle posé à droite de l'étiquette (un interrupteur). */
  control?: React.ReactNode;
  /** Contrôle posé sous l'étiquette (un segment, une grille, un champ). */
  children?: React.ReactNode;
}) {
  const text = "text-[12.5px] font-bold";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-[22px] items-center justify-between gap-2.5">
        {htmlFor ? (
          <label htmlFor={htmlFor} className={text}>
            {label}
          </label>
        ) : (
          <span className={text}>{label}</span>
        )}
        {control}
      </div>
      {children}
      {hint ? <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Toggle({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <Row
      label={label}
      hint={hint}
      control={
        <Switch
          id={id}
          aria-label={label}
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="h-[22px] w-[38px]"
        />
      }
    />
  );
}

/**
 * Le panneau « Thème » : préréglages, réglages, contrôle des contrastes.
 *
 * Purement présentationnel — il ne connaît ni le réseau ni la persistance. Le
 * thème lui est donné, il rend le suivant.
 *
 * ⚠️ **L'aperçu de la police est RÉEL, celui des couleurs est CALCULÉ.** La
 * grille rend chaque « Aa » dans sa vraie famille — les faces sont déclarées
 * dans `index.html` et servies par le Socle lui-même, donc aucune requête vers
 * un tiers et rien de téléchargé tant que cet écran n'est pas ouvert. Le
 * contrôle des contrastes, lui, mesure les couleurs réelles de la collectivité,
 * pas des valeurs d'exemple. Un panneau qui montrerait autre chose que ce qui
 * sera publié ne servirait à rien.
 */
export function ThemePanel({
  theme,
  branding,
  onChange,
  largeText,
  onLargeTextChange,
}: ThemePanelProps) {
  const current = presetName(theme);
  const colors = resolveThemeColors(theme, branding);
  const rows = contrastRows(theme, branding);
  const font = fontById(theme.typography.font);

  const setTypography = (patch: Partial<PortalTheme["typography"]>) =>
    onChange({ ...theme, typography: { ...theme.typography, ...patch } });
  const setShapes = (patch: Partial<PortalTheme["shapes"]>) =>
    onChange({ ...theme, shapes: { ...theme.shapes, ...patch } });
  const setHeader = (patch: Partial<PortalTheme["header"]>) =>
    onChange({ ...theme, header: { ...theme.header, ...patch } });
  const setAccessibility = (patch: Partial<PortalTheme["accessibility"]>) =>
    onChange({ ...theme, accessibility: { ...theme.accessibility, ...patch } });

  const filled = theme.header.fill === "color";

  return (
    <aside
      aria-label="Réglages du thème"
      className="flex w-[330px] shrink-0 flex-col border-r border-border bg-background"
    >
      <div className="flex flex-1 flex-col gap-5 overflow-auto p-4">
        <p className="rounded-lg bg-muted px-3 py-2 text-[11px] leading-snug text-muted-foreground">
          Le thème vaut pour <strong className="font-semibold">tout le site</strong>, pas bloc par
          bloc — page d'accueil comme formulaire d'une démarche. Il s'applique au portail à la
          publication.
        </p>

        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[12.5px] font-extrabold">Préréglages</h3>
            <span className="text-[11px] text-muted-foreground">{current ?? "Personnalisé"}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((preset) => {
              const active = current === preset.name;
              return (
                <button
                  key={preset.name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange(applyPreset(theme, preset.name))}
                  className={cn(
                    "flex flex-col gap-1.5 rounded-xl border p-2.5 text-left transition-colors hover:border-primary",
                    active ? "border-primary bg-primary/[0.06]" : "border-border bg-background",
                  )}
                >
                  {/* Trois barres aux angles et aux couleurs du préréglage :
                      ce qu'il change se voit avant d'être appliqué. */}
                  <span aria-hidden="true" className="flex h-[26px] items-end gap-1">
                    <span
                      className="w-3.5"
                      style={{
                        height: 26,
                        borderRadius: THEME_RADIUS_PX[preset.values.shapes.radius],
                        background: colors.primary,
                      }}
                    />
                    <span
                      className="w-3.5"
                      style={{
                        height: 18,
                        borderRadius: THEME_RADIUS_PX[preset.values.shapes.radius],
                        background: colors.accent,
                      }}
                    />
                    <span
                      className="flex-1"
                      style={{
                        height: 12,
                        borderRadius: THEME_RADIUS_PX[preset.values.shapes.radius],
                        background: colors.surface,
                      }}
                    />
                  </span>
                  <span
                    className="text-[12px] font-bold"
                    style={{ fontFamily: fontById(preset.values.typography.font).stack }}
                  >
                    {preset.name}
                  </span>
                  <span className="text-[10.5px] leading-snug text-muted-foreground">
                    {preset.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <Group title="Typographie">
          <Row label="Police" hint={font.note}>
            <div className="grid grid-cols-2 gap-1.5">
              {PORTAL_FONTS.map((item) => {
                const active = item.id === theme.typography.font;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTypography({ font: item.id as FontId })}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors hover:border-primary",
                      active ? "border-primary bg-primary/[0.06]" : "border-border bg-background",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="text-[19px] font-bold leading-none"
                      style={{ fontFamily: item.stack }}
                    >
                      Aa
                    </span>
                    <span className="truncate text-[10.5px] text-muted-foreground">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </Row>
          <Row
            label="Échelle de texte"
            hint="Agit sur l'ensemble du site, jamais bloc par bloc."
          >
            <SegmentedControl
              aria-label="Échelle de texte"
              size="sm"
              value={theme.typography.scale}
              onChange={(scale) => setTypography({ scale })}
              options={[
                { value: "compact", label: "Compacte" },
                { value: "standard", label: "Standard" },
                { value: "comfortable", label: "Confortable" },
              ]}
            />
          </Row>
        </Group>

        <Group title="Formes et densité">
          <Row label="Angles">
            <SegmentedControl
              aria-label="Angles"
              size="sm"
              value={theme.shapes.radius}
              onChange={(radius) => setShapes({ radius })}
              options={[
                { value: "square", label: "Droits" },
                { value: "soft", label: "Doux" },
                { value: "round", label: "Arrondis" },
              ]}
            />
          </Row>
          <Row label="Ombres">
            <SegmentedControl
              aria-label="Ombres"
              size="sm"
              value={theme.shapes.shadow}
              onChange={(shadow) => setShapes({ shadow })}
              options={[
                { value: "none", label: "Aucune" },
                { value: "soft", label: "Douces" },
                { value: "strong", label: "Marquées" },
              ]}
            />
          </Row>
          <Row
            label="Densité"
            hint="Espacement entre les blocs et à l'intérieur des cartes."
          >
            <SegmentedControl
              aria-label="Densité"
              size="sm"
              value={theme.shapes.density}
              onChange={(density) => setShapes({ density })}
              options={[
                { value: "compact", label: "Compacte" },
                { value: "standard", label: "Standard" },
                { value: "airy", label: "Aérée" },
              ]}
            />
          </Row>
        </Group>

        <Group title="En-tête">
          <Row label="Fond du bandeau">
            <SegmentedControl
              aria-label="Fond du bandeau"
              size="sm"
              value={theme.header.fill}
              onChange={(fill) => setHeader({ fill })}
              options={[
                { value: "white", label: "Blanc" },
                { value: "color", label: "Fond de couleur" },
              ]}
            />
          </Row>
          {/* Les deux réglages suivants n'ont de sens que sur un bandeau
              coloré. Ils sont MASQUÉS, pas remis à zéro : décocher le fond de
              couleur puis le recocher doit retrouver le réglage d'avant. */}
          {filled ? (
            <Row label="Couleur du bandeau" hint="Les deux couleurs de votre charte graphique.">
              <SegmentedControl
                aria-label="Couleur du bandeau"
                size="sm"
                value={theme.header.color}
                onChange={(color) => setHeader({ color })}
                options={[
                  { value: "primary", label: "Principale" },
                  { value: "secondary", label: "Secondaire" },
                ]}
              />
            </Row>
          ) : null}
          {filled ? (
            <Toggle
              id="theme-logo-white"
              label="Logo en version blanche"
              hint="Décochez si votre logo n'existe qu'en version couleur."
              checked={theme.header.logoWhite}
              onCheckedChange={(logoWhite) => setHeader({ logoWhite })}
            />
          ) : null}
          <Row label="Logo">
            <SegmentedControl
              aria-label="Logo"
              size="sm"
              value={theme.header.logo}
              onChange={(logo) => setHeader({ logo })}
              options={[
                { value: "left", label: "À gauche" },
                { value: "center", label: "Centré" },
              ]}
            />
          </Row>
          <Row label="Menu">
            <SegmentedControl
              aria-label="Menu"
              size="sm"
              value={theme.header.menu}
              onChange={(menu) => setHeader({ menu })}
              options={[
                { value: "text", label: "Texte" },
                { value: "pills", label: "Pilules" },
              ]}
            />
          </Row>
          <Row label="Bouton « Mon compte »">
            <SegmentedControl
              aria-label="Bouton Mon compte"
              size="sm"
              value={theme.header.account}
              onChange={(account) => setHeader({ account })}
              options={[
                { value: "prominent", label: "Mis en avant" },
                { value: "discreet", label: "Discret" },
              ]}
            />
          </Row>
          <Toggle
            id="theme-sticky"
            label="En-tête fixe au défilement"
            hint="Le bandeau reste visible quand l'usager descend dans la page."
            checked={theme.header.sticky}
            onCheckedChange={(sticky) => setHeader({ sticky })}
          />
        </Group>

        <Group title="Accessibilité">
          <Toggle
            id="theme-large-text"
            label="Aperçu gros texte"
            hint="Simule le réglage « texte agrandi » d'un usager : vérifiez que rien ne déborde. Aperçu seulement — ce réglage n'est pas enregistré."
            checked={largeText}
            onCheckedChange={onLargeTextChange}
          />
          <Toggle
            id="theme-high-contrast"
            label="Contraste renforcé"
            hint="Assombrit les textes, les bordures et votre couleur principale."
            checked={theme.accessibility.highContrast}
            onCheckedChange={(highContrast) => setAccessibility({ highContrast })}
          />
          <Toggle
            id="theme-dark-primary"
            label="Assombrir la couleur principale"
            hint="Votre charte graphique n'est pas modifiée : seule son application au site l'est."
            checked={theme.accessibility.darkPrimary}
            onCheckedChange={(darkPrimary) => setAccessibility({ darkPrimary })}
          />
          {/* La mention RGAA a quitté ce panneau le 2026-09-18 : c'est un
              contenu, pas une apparence. On dit où elle est partie — c'est ici
              qu'un agent habitué la cherchera d'abord. */}
          <p className="text-[11px] leading-snug text-muted-foreground">
            La mention d'accessibilité se règle dans « Composition », au pied de la page ; la
            déclaration elle-même se rédige dans « Contenus ».
          </p>
        </Group>

        <Group title="Contrôle des contrastes">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-col gap-2 rounded-lg border border-border px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex-1 text-[11.5px] leading-snug">{row.label}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {formatRatio(row.ratio)}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold",
                    row.status === "ok" && "bg-primary/10 text-primary",
                    row.status === "decorative" && "bg-muted text-muted-foreground",
                    row.status === "insufficient" && "bg-destructive/10 text-destructive",
                  )}
                >
                  {STATUS_LABELS[row.status]}
                </span>
              </div>
              {row.fix ? (
                <button
                  type="button"
                  onClick={() => setAccessibility({ darkPrimary: true })}
                  className="flex items-center gap-1.5 self-start rounded-lg border border-primary px-2.5 py-1 text-[11.5px] font-bold text-primary hover:bg-primary/[0.07]"
                >
                  <Check className="size-3" />
                  Assombrir la couleur principale
                </button>
              ) : null}
            </div>
          ))}
          <p className="text-[11px] leading-snug text-muted-foreground">
            Seuils RGAA AA : 4,5 : 1 pour le texte, 3 : 1 pour les éléments d'interface. Les
            séparateurs purement décoratifs n'y sont pas soumis. Les couleurs se règlent dans
            l'onglet « Charte graphique » de l'organisation.
          </p>
        </Group>
      </div>
    </aside>
  );
}

const STATUS_LABELS = {
  ok: "Conforme",
  decorative: "Décoratif",
  insufficient: "Insuffisant",
} as const;
