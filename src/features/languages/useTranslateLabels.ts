import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { languageLabel } from "@/features/languages/languages";

/**
 * Traduction automatique d'un libellé — l'appel depuis l'écran.
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
 */

export type TranslateLabelKind = "procedure" | "category";

export interface TranslateLabelsInput {
  /** Organisation principale : c'est elle qui active les langues et qui paie. */
  organizationId: string;
  /** Le libellé français — la langue pivot, celle du champ « libellé ». */
  label: string;
  kind: TranslateLabelKind;
  /** Codes des langues à traduire (français exclu). */
  codes: readonly string[];
}

export interface TranslateLabelsResult {
  /** Traductions proposées, par code de langue. */
  translations: Record<string, string>;
  /** Langues demandées restées sans proposition — l'écran le dit à l'agent. */
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

export function useTranslateLabels() {
  return useMutation({
    mutationFn: async (input: TranslateLabelsInput): Promise<TranslateLabelsResult> => {
      const { data, error } = await supabase.functions.invoke<TranslateLabelsResult>(
        "translate-labels",
        {
          body: {
            organization_id: input.organizationId,
            label: input.label,
            kind: input.kind,
            targets: input.codes.map((code) => ({ code, label: languageLabel(code) })),
          },
        },
      );
      if (error) throw new Error(await messageFromError(error));
      if (!data) throw new Error("Réponse invalide du serveur.");
      return {
        translations: data.translations ?? {},
        missing: Array.isArray(data.missing) ? data.missing : [],
      };
    },
  });
}
