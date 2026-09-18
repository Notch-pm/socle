import * as React from "react";
import type { CSSProperties } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, type SortingStrategy } from "@dnd-kit/sortable";
import { ChevronDown, Globe, Menu, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { languageLabel } from "@/features/languages/languages";
import type { PortalSection } from "@/features/portal/portalPage";
import type { PortalCatalogueEntry } from "@/features/portal/catalogue";
import type { PortalTheme } from "@/features/portal/portalTheme";
import { themeCssVariables, type ThemeBranding } from "@/features/portal/themeStyle";
import { DEVICE_PAGE_WIDTH, type Device } from "./device";
import { AccessibilityMentionBlock } from "./AccessibilityMention";
import { SectionBlock } from "./SectionBlock";

/** Id de la zone de dépôt racine : toute la liste des sections. */
export const CANVAS_DROP_ID = "canvas";

/**
 * Pas de glissement automatique des voisins : c'est l'OMBRE qui dit où le
 * bloc va. Les deux mécanismes ensemble se contrediraient — les voisins
 * s'écarteraient d'un côté pendant que l'ombre se dessinerait de l'autre.
 */
const noShift: SortingStrategy = () => null;

/**
 * La navigation du portail — DÉCORATIVE : aucune de ces pages n'existe encore,
 * mieux vaut du texte inerte qu'un lien mort. Même liste que Nora.
 */
const NAV_LABELS = ["Démarches", "Actualités", "Contact"] as const;

export interface PortalCanvasProps {
  organizationName: string;
  /**
   * Le logo de la collectivité, tel que le portail l'affichera. L'éditeur est
   * toujours sur une racine, qui n'hérite jamais de charte : la colonne
   * `logo_url` porte donc déjà la valeur **résolue** que Nora reçoit de
   * `GET /v1/organizations/{id}/branding` — pas besoin de la RPC ici.
   */
  organizationLogoUrl: string | null;
  /**
   * Le logo en version blanche, pour un bandeau de couleur. Absent, on retombe
   * sur le logo couleur : mieux vaut un logo un peu perdu sur son fond qu'un
   * bandeau anonyme.
   */
  organizationLogoWhiteUrl: string | null;
  /** Le thème du site — c'est lui qui peint la page et son bandeau. */
  theme: PortalTheme;
  /**
   * La charte de la collectivité. L'éditeur est toujours sur une racine, qui
   * n'hérite jamais : les colonnes portent déjà la valeur **résolue**.
   */
  branding: ThemeBranding | null;
  /** Simulation « texte agrandi » — de l'éditeur, jamais du site. */
  largeText?: boolean;
  /**
   * Les langues activées par la collectivité, français compris. Elles ne
   * servent ici qu'à MONTRER où le sélecteur de langue se placera pour
   * l'usager — le canevas est une maquette, pas le portail.
   */
  languages: readonly string[];
  sections: PortalSection[];
  device: Device;
  selectedId: string | null;
  catalogue: PortalCatalogueEntry[];
  /** La palette flottante occupe la gauche du canevas — la page laisse la place. */
  paletteOpen: boolean;
  previewing: boolean;
  /** Pendant un glisser : l'index où le bloc tomberait, `null` sinon. */
  dropIndex: number | null;
  /** Libellé du bloc en cours de déplacement, pour l'ombre. */
  dropLabel: string | null;
  onSelect: (id: string) => void;
  onShift: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onOpenPalette: () => void;
  /**
   * La déclaration d'accessibilité (onglet « Contenus ») a-t-elle un texte ?
   * Le lien de la mention n'apparaît qu'à cette condition — comme sur le site.
   */
  statementWritten: boolean;
  /** La mention du pied de site est-elle sélectionnée (son inspecteur ouvert) ? */
  mentionSelected: boolean;
  onSelectMention: () => void;
}

/**
 * L'identité de la collectivité dans le bandeau de la maquette : son logo
 * quand elle en a un, sinon la pastille — exactement le repli de Nora
 * (`PageHeader`), pour que l'agent voie ici ce que verra l'usager.
 *
 * ⚠️ Hauteur fixe, largeur LIBRE (bornée), comme dans l'en-tête de l'app :
 * les logos de collectivité sont des bandeaux larges, les enfermer dans un
 * carré les réduit à une tache. `logo_url` est une URL libre qui peut pointer
 * vers un fichier disparu : on retombe alors sur la pastille plutôt que de
 * laisser la vignette cassée du navigateur dans une maquette.
 */
function PageLogo({ url }: { url: string | null }) {
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => setBroken(false), [url]);
  if (!url || broken) {
    return (
      <div
        className="size-[26px] shrink-0 rounded-[var(--pt-radius-sm)]"
        style={{ background: "var(--pt-mark-bg)" }}
      />
    );
  }
  return (
    <img
      src={url}
      alt=""
      onError={() => setBroken(true)}
      className="h-7 w-auto max-w-[160px] shrink-0 object-contain"
    />
  );
}

/**
 * L'ombre : la place que prendra le bloc si on le lâche maintenant. Dessinée
 * à l'index de destination, entre les sections existantes, avec le libellé du
 * bloc — pour qu'on sache ce qui va tomber là, pas seulement où.
 */
function DropShadow({ label }: { label: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-[72px] items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-primary/[0.06] text-[12.5px] font-semibold text-primary"
    >
      {label} — déposer ici
    </div>
  );
}

/**
 * Le canevas défilant : page blanche mise à l'échelle pour tenir dans la
 * largeur libre entre la palette et l'inspecteur flottants. Le calcul (comme
 * la maquette) dépend de la largeur réelle du conteneur — d'où le
 * `ResizeObserver`, une donnée que Tailwind ne peut pas exprimer en classes.
 */
export function PortalCanvas({
  organizationName,
  organizationLogoUrl,
  organizationLogoWhiteUrl,
  theme,
  branding,
  largeText,
  languages,
  sections,
  device,
  selectedId,
  catalogue,
  paletteOpen,
  previewing,
  dropIndex,
  dropLabel,
  onSelect,
  onShift,
  onRemove,
  onOpenPalette,
  statementWritten,
  mentionSelected,
  onSelectMention,
}: PortalCanvasProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState(1128);
  // `null` = ajusté à la fenêtre ; un nombre = zoom choisi à la molette.
  const [zoom, setZoom] = React.useState<number | null>(null);
  const { setNodeRef: setListRef } = useDroppable({ id: CANVAS_DROP_ID, disabled: previewing });

  // Un pied de page en dernière position est le bas de la page : plus de
  // marge sous lui, et « Ajouter une section » passe au-dessus. Sauf pendant
  // qu'on glisse un bloc sous lui — l'ombre a besoin de la place.
  const endsWithFooter = sections[sections.length - 1]?.kind === "footer";
  const flushFooter = endsWithFooter && dropIndex !== sections.length;
  // Miroir de `startsWithFullWidthBanner` (Nora) : une image qui va d'un bord à
  // l'autre et commence la page se colle à l'en-tête. Pendant un glisser qui
  // viserait la première place, on rend la marge — sinon la cible de dépôt
  // n'aurait plus de place où s'afficher.
  const first = sections[0];
  const flushBanner = first !== undefined && first.kind === "recherche" &&
    first.imageUrl !== null && first.imageFullWidth && dropIndex !== 0;

  const addButton = previewing ? null : (
    <button
      type="button"
      onClick={onOpenPalette}
      className="flex h-14 items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-border text-[13.5px] font-semibold text-muted-foreground transition-colors hover:border-primary hover:bg-primary/[0.04] hover:text-primary"
    >
      <Plus className="size-4" />
      Ajouter une section
    </button>
  );

  React.useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hasInspector = !previewing && (selectedId != null || mentionSelected);
  const padLeft = previewing ? 32 : paletteOpen ? 254 : 72;
  const padRight = previewing ? 32 : hasInspector ? 338 : 32;
  const pageWidth = DEVICE_PAGE_WIDTH[device];
  const freeWidth = Math.max(320, containerWidth - padLeft - padRight);
  const fit = Math.min(1, Math.round((freeWidth / pageWidth) * 100) / 100);
  const scale = zoom ?? fit;

  // Ctrl (ou ⌘) + molette zoome le canevas — c'est aussi ce qu'envoie un
  // pincement sur pavé tactile. La molette seule continue de faire défiler.
  // Écouteur natif non passif : `preventDefault` doit empêcher le zoom du
  // navigateur entier. `fitRef` : le zoom part de l'échelle affichée à cet
  // instant, que l'écouteur — posé une fois — ne peut pas voir autrement.
  const fitRef = React.useRef(fit);
  fitRef.current = fit;
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      setZoom((current) => {
        const from = current ?? fitRef.current;
        const next = from * (event.deltaY < 0 ? 1.1 : 1 / 1.1);
        return Math.min(2, Math.max(0.25, Math.round(next * 100) / 100));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomHint = scale < 0.995 || scale > 1.005 ? ` · affiché à ${Math.round(scale * 100)} %` : "";
  const layoutHint =
    device === "mobile"
      ? "les grilles passent sur une colonne"
      : device === "tablette"
        ? "grilles limitées à 2 colonnes"
        : "mise en page complète";

  const shadow = dropIndex !== null && dropLabel !== null ? <DropShadow label={dropLabel} /> : null;

  // Le logo blanc ne sert que sur un bandeau de couleur, et seulement si la
  // collectivité en a déposé un : sans lui, le logo couleur reste préférable à
  // rien du tout.
  const headerLogoUrl =
    theme.header.fill === "color" && theme.header.logoWhite && organizationLogoWhiteUrl
      ? organizationLogoWhiteUrl
      : organizationLogoUrl;

  return (
    <div className="relative min-w-0 flex-1 bg-muted">
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-auto transition-[padding] duration-200 ease-out"
        style={{ padding: `30px ${padRight}px 60px ${padLeft}px` }}
      >
        <div className="flex flex-col items-center gap-2">
          <span className="flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
            {pageWidth} px{zoomHint} — {layoutHint}
            {zoom === null ? (
              <span className="text-muted-foreground/70">· Ctrl + molette pour zoomer</span>
            ) : (
              <button
                type="button"
                onClick={() => setZoom(null)}
                className="rounded-full border border-border px-2 py-0.5 font-semibold text-foreground hover:border-primary hover:text-primary"
              >
                Ajuster à la fenêtre
              </button>
            )}
          </span>
          {/* `zoom` et non `transform: scale()` : le zoom agit sur la mise en
              page, le conteneur défilant suit donc la page agrandie au lieu de
              la couper sur les bords — et centre celle qui est réduite. */}
          {/* ⚠️ TOUT LE THÈME TIENT DANS CET OBJET DE STYLE. Les sections ne
              reçoivent pas le thème en props : elles lisent des variables CSS.
              Régler un curseur ne recalcule donc qu'un objet, pas sept arbres
              de composants — et c'est ce qui rend l'aperçu instantané. */}
          <div
            className="overflow-hidden bg-white shadow-socle-lg transition-[width] duration-200 ease-out"
            style={{
              ...themeCssVariables(theme, branding, { largeText }),
              width: pageWidth,
              zoom: scale,
              borderRadius: 14,
              fontFamily: "var(--pt-font)",
              color: "var(--pt-ink)",
            }}
          >
            {/* Le bandeau : direction, hauteur, fond et encre viennent tous du
                thème. Le logo centré met la marque AU-DESSUS du menu — d'où une
                direction en colonne, pas un simple alignement. */}
            <header
              className="flex items-center gap-[var(--pt-header-gap)] border-b"
              style={{
                flexDirection: "var(--pt-header-direction)" as CSSProperties["flexDirection"],
                height: "var(--pt-header-height)",
                padding: "var(--pt-header-pad)",
                background: "var(--pt-header-surface)",
                color: "var(--pt-header-ink)",
                borderBottomColor: "var(--pt-header-border)",
              }}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <PageLogo url={headerLogoUrl} />
                <span className="truncate text-[length:var(--pt-h2)] font-extrabold tracking-tight">
                  {organizationName}
                </span>
              </div>
              <div className="flex-1" />
              {/* ⚠️ Nav, langue, compte et burger dans UN SEUL conteneur : en
                  logo centré l'en-tête passe en colonne, et des enfants frères
                  s'empileraient chacun sur sa ligne. Ce qu'on veut, c'est DEUX
                  lignes — la marque, puis tout le reste. */}
              <div className="flex items-center gap-2.5">
                <nav className={cn("flex items-center gap-2", device === "mobile" && "hidden")}>
                  {NAV_LABELS.map((label) => (
                    <span
                      key={label}
                      className="whitespace-nowrap text-[length:var(--pt-small)]"
                      style={{
                        color: "var(--pt-header-muted)",
                        background: "var(--pt-nav-bg)",
                        padding: "var(--pt-nav-pad)",
                        borderRadius: "var(--pt-nav-radius)",
                      }}
                    >
                      {label}
                    </span>
                  ))}
                </nav>
                {/* ⚠️ DÉCORATIF, comme la nav et « Mon compte » : c'est la place
                    du sélecteur que verra l'usager, pas un contrôle. Affiché
                    seulement si la collectivité a plus d'une langue — sinon on
                    montrerait un élément que ses usagers ne verront jamais — et
                    visible même en mobile, contrairement à la nav : c'est le seul
                    élément qu'un visiteur non francophone doit pouvoir atteindre
                    sur un téléphone. */}
                {languages.length > 1 ? (
                  <span
                    className="flex items-center gap-1 whitespace-nowrap rounded-[var(--pt-radius-sm)] border px-2 py-1 text-[length:var(--pt-small)]"
                    style={{ color: "var(--pt-header-muted)", borderColor: "var(--pt-account-border)" }}
                    title={languages.map(languageLabel).join(", ")}
                  >
                    <Globe className="size-3.5" />
                    Français
                    <ChevronDown className="size-3" />
                  </span>
                ) : null}
                <span
                  className="whitespace-nowrap rounded-[var(--pt-radius-sm)] border text-[length:var(--pt-small)] font-bold"
                  style={{
                    background: "var(--pt-account-bg)",
                    color: "var(--pt-account-fg)",
                    borderColor: "var(--pt-account-border)",
                    padding: "var(--pt-account-pad)",
                  }}
                >
                  Mon compte
                </span>
                {device === "mobile" ? (
                  <div
                    className="flex size-[30px] shrink-0 items-center justify-center rounded-[var(--pt-radius-sm)] border"
                    style={{ borderColor: "var(--pt-account-border)" }}
                  >
                    <Menu className="size-[15px]" />
                  </div>
                ) : null}
              </div>
            </header>

            <SortableContext items={sections.map((s) => s.id)} strategy={noShift}>
              {/* ⚠️ Le rembourrage HORIZONTAL reste fixe (14 px mobile, 24 px
                  ailleurs) : le pied de page l'annule par des marges négatives
                  chiffrées pour aller au bord (`FooterSection`). Le rendre
                  variable le ferait dépasser ou rentrer à chaque changement de
                  densité. La densité gouverne donc l'écart entre les blocs et
                  le rembourrage vertical — ce que son aide annonce. */}
              <div
                ref={setListRef}
                className={cn("flex flex-col", device === "mobile" ? "px-3.5" : "px-6")}
                style={{
                  gap: "var(--pt-gap)",
                  // Un bandeau pleine largeur en tête de page touche l'en-tête,
                  // comme sur le site : sinon l'aperçu montrerait une bande de
                  // page entre la barre de navigation et l'image. Symétrique du
                  // pied de page collé au bas (`flushFooter`).
                  paddingTop: flushBanner ? 0 : "var(--pt-pad)",
                  paddingBottom: flushFooter ? 0 : "var(--pt-pad)",
                }}
              >
                {sections.map((section, index) => (
                  <React.Fragment key={section.id}>
                    {endsWithFooter && index === sections.length - 1 ? addButton : null}
                    {dropIndex === index ? shadow : null}
                    <SectionBlock
                      section={section}
                      device={device}
                      catalogue={catalogue}
                      scale={scale}
                      selected={!previewing && section.id === selectedId}
                      isFirst={index === 0}
                      isLast={index === sections.length - 1}
                      flush={flushFooter && index === sections.length - 1}
                      previewing={previewing}
                      onSelect={() => onSelect(section.id)}
                      onShift={(direction) => onShift(section.id, direction)}
                      onRemove={() => onRemove(section.id)}
                    />
                  </React.Fragment>
                ))}
                {dropIndex === sections.length ? shadow : null}
                {endsWithFooter ? null : addButton}
              </div>
            </SortableContext>

            {/* La mention d'accessibilité : SOUS la dernière section, pied de
                page composé compris — exactement où Nora la pose. Hors de la
                liste triable : elle ne se déplace ni ne se supprime, et vaut
                pour toutes les pages du site, pas pour cette composition. */}
            <AccessibilityMentionBlock
              theme={theme}
              statementWritten={statementWritten}
              selected={!previewing && mentionSelected}
              previewing={previewing}
              onSelect={onSelectMention}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
