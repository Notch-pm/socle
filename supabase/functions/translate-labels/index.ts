/**
 * Traduction automatique des textes d'une ligne — la fonction appelée par
 * l'écran.
 *
 * L'agent tape « Demande d'acte de naissance » et son descriptif court, clique
 * sur « Traduire automatiquement », et les champs des langues activées par sa
 * collectivité se remplissent. Cette fonction est ce qu'il y a entre les deux.
 * Elle traduit TOUS les textes d'une ligne ensemble — un descriptif traduit en
 * sachant de quelle démarche il parle, un paragraphe en sachant de quel bloc de
 * page. Les LANGUES, elles, sont découpées en lots quand elles sont nombreuses :
 * le plafond de sortie appartient au guichet, et une réponse tronquée est un
 * appel payé pour rien (voir `_shared/translate.ts`).
 *
 * POURQUOI ELLE EXISTE PLUTÔT QU'UN APPEL DIRECT DEPUIS LE NAVIGATEUR :
 * `ai-api` s'authentifie par CLÉ API, et une clé dans un navigateur est une clé
 * publiée. Il fallait donc un porteur côté serveur. Cette fonction est ce
 * porteur, et rien d'autre : elle vérifie QUI demande, borne CE QUI est
 * demandé, et confie le reste au guichet.
 *
 * ⚠️ ELLE N'APPELLE PAS LE FOURNISSEUR — elle appelle `ai-api`, comme Iris ou
 * Clara. C'est la règle de la maison : « les applications de la gamme
 * n'appellent plus le fournisseur, elles appellent ici ». Le Socle est ici sa
 * propre application consommatrice (`api_keys.consumer = 'socle'`), et sa
 * dépense apparaît dans la ventilation de la collectivité au même titre que
 * celle des autres. Ne jamais la « simplifier » en lisant `MISTRAL_API_KEY`
 * directement : ce serait un second appelant du fournisseur, donc un second
 * endroit où le plafond, la cadence et le journal pourraient diverger.
 *
 * ⚠️ AUTORISATION = LE MIROIR EXACT DU RLS QUI GOUVERNE LA LIGNE VISÉE. Les
 * traductions se posent sur `procedures.translations` et
 * `categories.translations`, dont l'écriture est gardée par
 * `is_org_admin(organization_id)` : c'est donc `is_org_admin` qui est vérifié
 * ici, évalué AVEC LES DROITS DE L'APPELANT (client anon + son JWT), jamais
 * avec la service role. Traduire pour une organisation où l'on ne pourrait
 * rien enregistrer n'aurait aucun sens — et se paierait sur son crédit.
 *
 * ⚠️ PASSE-PLAT, ICI AUSSI : les textes traversent cette fonction, ils n'y sont
 * jamais journalisés. Aucun `console.*` ne doit porter les textes, les cibles
 * ou la réponse du modèle — `passthrough.test.ts` lit ce fichier pour le
 * vérifier.
 *
 * ⚠️ CHAÎNE DE DÉLAIS : fournisseur 55 s < `ai-api` 60 s < cette fonction 75 s.
 * Inversée, l'écran abandonnerait des appels que le Socle termine et facture.
 *
 * Déployée avec `verify_jwt = true` (voir `supabase/config.toml`) : la
 * passerelle refuse déjà ce qui n'a pas de session valide, et le code vérifie
 * l'autorisation fine — même motif que `invite-user` et `send-test-email`.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  allowedTargets,
  buildTranslationPrompt,
  parseTranslationAnswer,
  parseTranslatePayload,
  targetBatches,
  type TranslatedEntry,
  type TranslationTarget,
} from "./_shared/translate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Statut HTTP par code applicatif — même enveloppe que les trois APIs. */
const ERROR_STATUS: Record<string, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  ai_quota_exceeded: 429,
  ai_rate_limited: 429,
  internal_error: 500,
  ai_unavailable: 502,
  not_configured: 503,
};

function jsonResponse(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extra, "Content-Type": "application/json" },
  });
}

function errorResponse(code: string, message: string, extra: Record<string, string> = {}): Response {
  return jsonResponse(ERROR_STATUS[code] ?? 500, { error: { code, message } }, extra);
}

/** Le guichet, tel qu'on l'appelle. `ai-api` est servie par la même passerelle. */
const AI_API_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-api/v1/completions`;
const AI_API_TIMEOUT_MS = 75_000;

/**
 * Les refus de `ai-api` que l'AGENT doit lire tels quels : ils lui disent quoi
 * faire (attendre, ou demander un relèvement). Les autres — clé invalide,
 * payload refusé — parlent de NOTRE configuration, pas de la sienne : les
 * relayer enverrait un agent chercher une clé API qu'il n'a pas.
 */
const RELAYED_CODES = new Set([
  "ai_quota_exceeded",
  "ai_rate_limited",
  "ai_unavailable",
  "not_configured",
]);

const NOT_CONFIGURED_MESSAGE =
  "La traduction automatique n'est pas configurée sur cette plateforme.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return errorResponse("method_not_allowed", "Seule la méthode POST est autorisée.");
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("unauthorized", "Non autorisé.");
    }

    // Client évalué AVEC LES DROITS DE L'APPELANT : le RLS et les helpers
    // répondent comme ils répondraient à son navigateur (motif `send-test-email`).
    const caller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await caller.auth.getUser();
    if (!user) {
      return errorResponse("unauthorized", "Non autorisé.");
    }

    const parsed = parseTranslatePayload(await req.json().catch(() => null));
    if (!parsed.ok) {
      return errorResponse("bad_request", parsed.message);
    }
    const request = parsed.value;

    // Les langues de l'organisation, lues SOUS RLS : une organisation que
    // l'appelant ne voit pas est introuvable, elle ne se devine pas.
    const { data: org, error: orgError } = await caller
      .from("organizations")
      .select("enabled_languages")
      .eq("id", request.organizationId)
      .maybeSingle();
    if (orgError) throw orgError;
    if (!org) {
      return errorResponse("not_found", "Organisation introuvable.");
    }

    // Le miroir exact du RLS d'écriture de `procedures` / `categories`.
    const { data: isAdmin, error: adminError } = await caller.rpc("is_org_admin", {
      org_id: request.organizationId,
    });
    if (adminError) throw adminError;
    if (!isAdmin) {
      return errorResponse("forbidden", "Accès refusé.");
    }

    const targets = allowedTargets(request.targets, org.enabled_languages);
    if (targets.length === 0) {
      return errorResponse(
        "bad_request",
        "Aucune des langues demandées n'est activée pour cette organisation.",
      );
    }

    const socleKey = Deno.env.get("SOCLE_AI_API_KEY");
    if (!socleKey) {
      // Après l'authentification, comme `ai-api` : un appelant non authentifié
      // n'apprend pas de quoi la plateforme est équipée.
      console.error("translate-labels: SOCLE_AI_API_KEY absent — traduction indisponible");
      return errorResponse("not_configured", NOT_CONFIGURED_MESSAGE);
    }

    /** Un appel au guichet pour un lot de langues. */
    async function askGuichet(batch: TranslationTarget[]): Promise<Response | Record<string, TranslatedEntry>> {
      const prompt = buildTranslationPrompt({ ...request, targets: batch });

      let res: Response;
      try {
        res = await fetch(AI_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${socleKey}`,
            // Clé PLATEFORME : c'est cet en-tête qui dit quelle collectivité
            // paie. `ai-api` remonte lui-même à la racine.
            "X-Organization-Id": request.organizationId,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            feature: "traduction-libelles",
            system: prompt.system,
            messages: prompt.messages,
            response_format: "json",
            max_output_tokens: prompt.maxOutput,
            // L'acteur, c'est l'agent : la cadence se compte par personne, pas
            // par collectivité (voir le garde-fou de débit de `ai-api`).
            actor_id: user.id,
            reference: { kind: request.kind },
          }),
          signal: AbortSignal.timeout(AI_API_TIMEOUT_MS),
        });
      } catch (_) {
        console.error("translate-labels: aucune réponse du guichet IA");
        return errorResponse(
          "ai_unavailable",
          "La traduction automatique est momentanément indisponible — réessayez dans un instant.",
        );
      }

      const body = await res.json().catch(() => null) as
        | { answer?: unknown; error?: { code?: string; message?: string } }
        | null;

      if (!res.ok) {
        const code = body?.error?.code ?? "";
        // Le refus du guichet est journalisé par SON code, jamais par ce qu'on
        // lui a envoyé.
        console.warn(`translate-labels: guichet IA refuse — status=${res.status} code=${code || "-"}`);
        if (RELAYED_CODES.has(code)) {
          const retryAfter = res.headers.get("Retry-After");
          return errorResponse(
            code,
            body?.error?.message ?? "La traduction automatique est momentanément indisponible.",
            retryAfter ? { "Retry-After": retryAfter } : {},
          );
        }
        // Tout le reste parle de notre configuration : clé révoquée, scope
        // manquant, payload refusé. L'agent n'y peut rien, l'exploitant si.
        return errorResponse("not_configured", NOT_CONFIGURED_MESSAGE);
      }

      return parseTranslationAnswer(body?.answer, batch, request.fields).translations;
    }

    // ⚠️ UN APPEL PAR LOT DE LANGUES. Le plafond de sortie appartient au
    // guichet : lui en demander plus n'a aucun effet, sinon de recevoir un JSON
    // coupé en deux — un appel payé pour rien. `targetBatches` taille les lots
    // d'après ce que les textes demandés coûtent (un paragraphe pèse lourd).
    const translations: Record<string, TranslatedEntry> = {};
    const batches = targetBatches(targets, request.fields);
    for (const batch of batches) {
      const result = await askGuichet(batch);
      if (result instanceof Response) {
        // ⚠️ Le premier lot qui échoue emporte tout : il n'y a rien à montrer,
        // et le refus (crédit épuisé, cadence) doit être lu. Un lot suivant qui
        // échoue, en revanche, n'annule pas ce qui est déjà traduit ET PAYÉ :
        // on rend ce qu'on a, les langues manquantes se voient à leurs cases
        // vides.
        if (Object.keys(translations).length === 0) return result;
        break;
      }
      Object.assign(translations, result);
    }

    return jsonResponse(200, {
      translations,
      missing: targets.map((t) => t.code).filter((code) => !(code in translations)),
    });
  } catch (error) {
    console.error("translate-labels: erreur interne", error instanceof Error ? error.message : "");
    return errorResponse("internal_error", "Erreur interne du serveur.");
  }
});
