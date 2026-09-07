import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { languageLabel } from "@/features/languages/languages";
import { TRANSLATABLE_FIELDS, type TranslatableField } from "@/features/languages/translations";

/**
 * Traduction automatique des textes d'une ligne — l'appel depuis l'écran.
 *
 * Aucune écriture : la fonction rend des traductions, l'écran les pose dans ses
 * champs, et c'est l'enregistrement de la démarche ou de la catégorie qui les
 * persiste. Une traduction proposée que l'agent n'enregistre pas n'existe pas —
 * c'est ce qui lui laisse le dernier mot sur ce qui sera publié.
 *
 * ⚠️ LE CATALOGUE DES LANGUES PART D'ICI (`languageLabel`) : le serveur ne le
 * connaît pas, et c'est voulu — il vit dans le front, propriétaire déclaré de
 * ce contrat de nommage. Le serveur, lui, recoupe les CODES avec les langues
 * activées par l'organisation : c'est lui qui décide ce qui peut être traduit,
 * pas cet appelant.
 *
 * ⚠️ UN SEUL APPEL POUR TOUS LES TEXTES d'une ligne (libellé, descriptif
 * court…), pas un par champ : c'est un seul débit sur le crédit de la
 * collectivité et un seul coup de cadence, et le modèle traduit le descriptif
 * en sachant de quelle démarche il parle.
 */

export type TranslateLabelKind = "procedure" | "category";

/** Un texte français à traduire, sous la clé qu'il portera dans `translations`. */
export interface TranslateLabelsField {
  key: TranslatableField;
  value: string;
}

export interface TranslateLabelsInput {
  /** Organisation principale : c'est elle qui active les langues et qui paie. */
  organizationId: string;
  kind: TranslateLabelKind;
  /** Codes des langues à traduire (français exclu). */
  codes: readonly string[];
  /** Les textes français — la langue pivot. */
  fields: readonly TranslateLabelsField[];
}

export interface TranslateLabelsResult {
  /** Traductions proposées : par code de langue, un texte par champ. */
  translations: Record<string, Partial<Record<TranslatableField, string>>>;
  /** Langues demandées restées sans aucune proposition — l'écran le dit à l'agent. */
  missing: string[];
}

/**
 * Le message FRANÇAIS de la fonction, pas celui de supabase-js.
 *
 * ⚠️ `functions.invoke` ne rend qu'un « Edge Function returned a non-2xx status
 * code » sur toute réponse d'erreur : le corps, lui, porte la phrase utile
 * (« Crédit IA épuisé… », « vous allez trop vite… »). Sans cette lecture,
 * l'agent verrait une phrase anglaise qui ne lui dit rien de ce qu'il doit
 * faire.
 */
async function messageFromError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      const message = body?.error?.message;
      if (typeof message === "string" && message.trim() !== "") return message;
    } catch (_) {
      // corps illisible : on retombe sur le message générique
    }
  }
  return "La traduction automatique a échoué. Réessayez dans un instant.";
}

/** La réponse du serveur, ramenée à ce que l'écran sait poser dans ses champs. */
function readTranslations(raw: unknown): TranslateLabelsResult["translations"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: TranslateLabelsResult["translations"] = {};
  for (const [code, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const source = entry as Record<string, unknown>;
    const kept: Partial<Record<TranslatableField, string>> = {};
    for (const field of TRANSLATABLE_FIELDS) {
      const value = source[field];
      if (typeof value === "string" && value.trim() !== "") kept[field] = value;
    }
    if (Object.keys(kept).length > 0) out[code] = kept;
  }
  return out;
}

export function useTranslateLabels() {
  return useMutation({
    mutationFn: async (input: TranslateLabelsInput): Promise<TranslateLabelsResult> => {
      const { data, error } = await supabase.functions.invoke<TranslateLabelsResult>(
        "translate-labels",
        {
          body: {
            organization_id: input.organizationId,
            kind: input.kind,
            fields: input.fields.map((field) => ({ key: field.key, value: field.value })),
            targets: input.codes.map((code) => ({ code, label: languageLabel(code) })),
          },
        },
      );
      if (error) throw new Error(await messageFromError(error));
      if (!data) throw new Error("Réponse invalide du serveur.");
      return {
        translations: readTranslations(data.translations),
        missing: Array.isArray(data.missing) ? data.missing : [],
      };
    },
  });
}
