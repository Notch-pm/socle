import { ChevronRight } from "lucide-react";
import { TranslationFields } from "@/features/languages/TranslationFields";
import { translatableLanguages } from "@/features/languages/languages";
import {
  applySectionTranslations,
  fieldsForKind,
  hasTranslations,
  sectionText,
  setSectionTranslation,
  type PortalSection,
} from "@/features/portal/portalPage";
import type { PortalSectionField } from "@/features/languages/translations";

/** Ce que chaque texte s'appelle à l'écran — les mots de l'inspecteur. */
const FIELD_LABELS: Record<PortalSectionField, string> = {
  title: "Titre",
  subtitle: "Sous-titre",
  placeholder: "Texte du champ",
  body: "Paragraphe",
};

/**
 * Les traductions d'un bloc, dans l'inspecteur.
 *
 * ⚠️ UN SEUL BLOC PAR SECTION, en bas du panneau — donc **sous** tous les
 * textes français qu'il traduit, comme partout ailleurs dans la maison. Un
 * bloc par champ produirait un appel au guichet IA par champ, alors que la
 * règle est « un seul appel pour tous les textes d'une ligne » : un seul débit
 * sur le crédit de la collectivité, un seul coup de cadence, et un paragraphe
 * traduit en sachant de quel bloc il fait partie.
 *
 * ⚠️ RIEN NE S'AFFICHE SI LA COLLECTIVITÉ EST MONOLINGUE. Le garde est ici et
 * pas dans `TranslationFields` : les écrans de paramétrage (démarche,
 * catégorie) gardent leur phrase « aucune autre langue n'est activée — voir
 * Langues », qui y a du sens. Un canevas n'explique pas un réglage qui vit
 * ailleurs, il n'affiche rien.
 *
 * Replié par défaut, ouvert d'emblée si le bloc porte déjà une traduction :
 * un agent qui revient sur son travail le voit, un agent qui compose ne le
 * subit pas dans un panneau de 306 px.
 */
export function SectionTranslations({
  section,
  languages,
  organizationId,
  idPrefix,
  onChange,
}: {
  section: PortalSection;
  /** Langues activées par l'organisation principale (français compris). */
  languages: readonly string[];
  organizationId: string;
  idPrefix: string;
  onChange: (section: PortalSection) => void;
}) {
  const codes = translatableLanguages(languages);
  if (codes.length === 0) return null;

  const fields = fieldsForKind(section.kind).map((key) => ({
    key,
    label: FIELD_LABELS[key],
    source: sectionText(section, key),
    multiline: key === "body",
  }));

  return (
    <details
      open={hasTranslations(section)}
      className="group rounded-lg border border-border bg-muted/20 px-3 py-2.5"
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-bold marker:content-none">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
        Traductions — {codes.length} {codes.length > 1 ? "langues" : "langue"}
      </summary>
      <div className="pt-3">
        <TranslationFields
          enabled={languages}
          value={section.translations}
          onChange={(code, field, value) =>
            onChange({
              ...section,
              translations: setSectionTranslation(
                section.translations,
                code,
                field as PortalSectionField,
                value,
              ),
            } as PortalSection)
          }
          // Une réponse = un seul geste : le parent possède la page entière,
          // et trois écritures dans le même tick n'en laisseraient qu'une.
          onApply={(patch) =>
            onChange({
              ...section,
              translations: applySectionTranslations(section.translations, patch),
            } as PortalSection)
          }
          idPrefix={idPrefix}
          organizationId={organizationId}
          // Le panneau fait 306 px : les boutons s'empilent et les langues
          // tiennent sur une colonne.
          dense
          fields={fields}
          kind="portal_section"
          // ⚠️ Ici, il n'y a pas de formulaire à valider : le brouillon
          // s'enregistre tout seul, et ce qui est en ligne ne change qu'à
          // « Publier ». Le dire autrement apprendrait à ne plus lire.
          reviewHint="relisez avant de publier."
          overwriteHint="Le brouillon est enregistré automatiquement ; rien ne change en ligne tant que vous n'avez pas publié."
        />
      </div>
    </details>
  );
}
