/**
 * API IA Socle — le guichet unique du fournisseur LLM pour toute la gamme.
 *
 * Le Socle détient la clé, compte ce qu'elle dépense, et refuse quand le
 * plafond est atteint. Iris, Clara et ce qui viendra n'appellent plus le
 * fournisseur : ils appellent ici.
 *
 * POURQUOI UNE TROISIÈME FONCTION plutôt qu'une route de plus :
 * `public-api` refuse tout ce qui n'est pas GET — cette ligne EST son contrat,
 * en lecture seule pour tous ses consommateurs. `contacts-api` est la surface
 * des données personnelles, gardée par son propre scope. Troisième domaine,
 * troisième fonction, troisième scope : c'est déjà la décision de la maison.
 *
 * Auth : clé API (`Authorization: Bearer`, hachée SHA-256) portant le scope
 * **`ai`** ET rattachée à une application (`api_keys.consumer`) — sans quoi la
 * dépense ne serait imputable à personne. Déployée avec `verify_jwt = false`.
 *
 * Isolation : le budget est par COLLECTIVITÉ, donc par organisation RACINE.
 * Clé liée ⇒ son organisation. Clé plateforme ⇒ la racine de l'organisation
 * portée par `X-Organization-Id` (motif `contacts-api`). Un appel émis au nom
 * d'une sous-organisation débite sa racine.
 *
 * ⚠️ PASSE-PLAT : LE SOCLE NE CONSERVE NI LE PROMPT NI LA RÉPONSE. Le journal
 * (`ai_usage_events`) n'a aucune colonne capable de les porter, les signatures
 * de RPC non plus, et `_shared/provider.ts` — qui seul voit le texte — ne
 * reçoit ni client de base, ni logger. Ce qui EST journalisé : statut HTTP,
 * identifiant d'événement, organisation, consommateur, statut du fournisseur.
 * Rien d'autre. Un test lit ce fichier pour le vérifier.
 *
 * ⚠️ CHAÎNE DE DÉLAIS : Mistral 55 s < Socle 60 s < consommateur 75 s.
 *
 * DEUX DÉPENSES, UNE SEULE PORTE. `POST /v1/completions` fait parler le
 * modèle ; `POST /v1/ocr` fait lire un document scanné. Elles n'ont ni la même
 * unité chez le fournisseur (jetons d'un côté, pages de l'autre) ni la même
 * forme d'entrée, mais elles passent par la MÊME réservation, le même
 * compteur et le même plafond — sans quoi une collectivité aurait deux
 * crédits, et l'éditeur deux totaux à additionner à la main. La conversion
 * pages → jetons vit dans `_shared/ocr.ts`, à un seul endroit.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { errorBody, errorResponse, jsonResponse } from "./_shared/errors.ts";
import { buildOpenApiDocument } from "./_shared/openapi.ts";
import { callProvider, callProviderOcr, PROVIDER_NAME } from "./_shared/provider.ts";
import { parseOcrPayload, reservationForOcr, tokensForOcrText } from "./_shared/ocr.ts";
import {
  callerLimit,
  nextRenewalIso,
  othersEngaged,
  periodKey,
  quotaExceededMessage,
  rateLimitedMessage,
  secondsUntilNextMinute,
  type ShareRow,
} from "./_shared/quota.ts";
import {
  clampOutput,
  estimateInput,
  MAX_INPUT_TOKENS,
  reservationFor,
} from "./_shared/tokens.ts";
import {
  isUuid,
  parseCompletionPayload,
  resolveRootOrgId,
  type OrgParentRow,
} from "./_shared/validation.ts";
import { API_KEY_COLUMNS, evaluateApiKey, shouldTouchKey, type ApiKeyRow } from "./_shared/apiKeyAuth.ts";

const FUNCTION_NAME = "ai-api";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-organization-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match ? match[1].trim() : null;
}

function parseRoute(req: Request): { path: string; serverUrl: string } {
  const url = new URL(req.url);
  const marker = `/${FUNCTION_NAME}`;
  const idx = url.pathname.indexOf(marker);
  const prefixEnd = idx >= 0 ? idx + marker.length : 0;
  let path = url.pathname.slice(prefixEnd);
  if (path === "") path = "/";
  // La passerelle Supabase retire `/functions/v1` et termine le TLS : on
  // reconstruit l'URL publique à partir des en-têtes transmis + du préfixe FIXE.
  // ⚠️ La déduire du chemin entrant (`url.pathname`) annonçait `https://<host>/ai-api`,
  // qui répond 404 — un consommateur qui fait confiance au contrat partait dans le mur.
  // `public-api` et `contacts-api` font ceci depuis toujours ; seule celle-ci divergeait.
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(/:$/, "");
  const host = req.headers.get("x-forwarded-host") ?? url.host;
  return { path, serverUrl: `${proto}://${host}/functions/v1/${FUNCTION_NAME}` };
}

/**
 * Résout l'ALIAS d'agent fourni par le consommateur en identifiant réel, lu
 * dans un secret. Le consommateur ne connaît jamais l'identifiant : il demande
 * « assistant-instruction », le Socle sait lequel c'est, et peut en changer
 * (nouveau modèle, nouveau ton) sans qu'aucune application ne bouge.
 * Alias inconnu ⇒ `null` ⇒ repli sur le modèle par défaut, jamais un refus.
 */
function agentIdForAlias(alias: string | null): string | null {
  if (!alias) return null;
  const suffix = alias.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return Deno.env.get(`MISTRAL_AGENT_${suffix}`) ?? null;
}

/**
 * Ce que renvoie la RPC de réservation, dans les deux cas de refus comme dans
 * le cas passant. Nommé une fois : les deux routes payantes le lisent.
 */
interface Reservation {
  event_id: string | null;
  allowed: boolean;
  reason: string | null;
  limit_tokens: number | null;
  used_tokens: number | null;
  reserved_tokens: number | null;
  usage_period: string | null;
  renews_at: string | null;
}

/**
 * ⚠️ DEUX REFUS DISTINCTS, ET LA DISTINCTION COMPTE POUR QUI LA REÇOIT.
 * Le plafond dit « votre crédit est épuisé » — le geste est de demander un
 * relèvement, et il n'y a rien à réessayer avant le mois prochain. La cadence
 * dit « vous allez trop vite » — le crédit est intact, il suffit d'attendre le
 * prochain top de minute. Les confondre enverrait un appelant freiné réclamer
 * un budget dont il dispose déjà.
 *
 * Les deux fabriques vivent ici parce que `/v1/completions` et `/v1/ocr`
 * doivent refuser AVEC LES MÊMES MOTS : deux formulations pour un même refus
 * obligeraient chaque consommateur à reconnaître deux formes.
 */
function rateLimitedResponse(now: Date, headers: Record<string, string>): Response {
  return jsonResponse(429, errorBody("ai_rate_limited", rateLimitedMessage()), {
    ...headers,
    // Secondes jusqu'à la fenêtre suivante, jamais 0 : `Retry-After: 0`
    // inviterait à réessayer immédiatement, exactement ce qu'on freine.
    "Retry-After": String(secondsUntilNextMinute(now)),
  });
}

function quotaExceededResponse(
  reserved: Reservation | null | undefined,
  now: Date,
  headers: Record<string, string>,
): Response {
  const renews = reserved?.renews_at ?? nextRenewalIso(now);
  return jsonResponse(429, {
    error: { code: "ai_quota_exceeded", message: quotaExceededMessage(renews) },
    quota: {
      unlimited: false,
      limit: reserved?.limit_tokens ?? null,
      used_tokens: reserved?.used_tokens ?? null,
      reserved_tokens: reserved?.reserved_tokens ?? null,
      period: reserved?.usage_period ?? periodKey(now),
      renews_at: renews,
    },
  }, headers);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { path, serverUrl } = parseRoute(req);

  // --- Endpoints publics (documentation) -----------------------------------
  if (path === "/" || path === "/v1") {
    return jsonResponse(200, {
      name: "API IA Socle — guichet du fournisseur LLM",
      description:
        "Appels au modèle et lecture de documents scannés pour les applications de la gamme, " +
        "décomptés du même plafond de la collectivité. Le Socle ne conserve ni le prompt, " +
        "ni la réponse, ni le document.",
      openapi: `${serverUrl}/openapi.json`,
    }, corsHeaders);
  }
  if (path === "/openapi.json") {
    return jsonResponse(200, buildOpenApiDocument(serverUrl), corsHeaders);
  }

  if (!["GET", "POST"].includes(req.method)) {
    return errorResponse("method_not_allowed", "Méthode non autorisée.", corsHeaders);
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- Authentification par clé API + scope `ai` -------------------------
    const token = bearerToken(req.headers.get("Authorization"));
    if (!token) {
      return errorResponse("unauthorized", "Clé API manquante (Authorization: Bearer).", corsHeaders);
    }
    const keyHash = await sha256Hex(token);
    const { data: apiKeyRow } = await admin
      .from("api_keys")
      .select(API_KEY_COLUMNS)
      .eq("key_hash", keyHash)
      .maybeSingle();

    // La décision (révoquée, expirée, scope, clé plateforme sans application)
    // vit dans _shared/apiKeyAuth.ts, identique dans les trois fonctions.
    const decision = evaluateApiKey(apiKeyRow as ApiKeyRow | null, {
      requiredScope: "ai",
      scopeMessage: "Cette clé ne porte pas le scope « ai » requis pour l'assistant.",
    });
    if (!decision.ok) return errorResponse(decision.code, decision.message, corsHeaders);
    const apiKey = decision.key;
    // L'imputation vient de la clé — pour une clé LIÉE aussi. Sans elle, le
    // journal ne saurait pas à qui rattacher la dépense — et une dépense non
    // imputable n'a pas lieu.
    const consumer = apiKey.consumer ?? "";
    if (consumer === "") {
      return errorResponse(
        "forbidden",
        "Cette clé n'est rattachée à aucune application consommatrice : la consommation ne serait imputable à personne.",
        corsHeaders,
      );
    }

    // --- Périmètre : la RACINE, parce que le budget est par collectivité ----
    let orgId: string;
    if (apiKey.organization_id !== null) {
      orgId = apiKey.organization_id;
    } else {
      const requested = req.headers.get("x-organization-id")?.trim() ?? "";
      if (!isUuid(requested)) {
        return errorResponse(
          "bad_request",
          "Clé plateforme : en-tête X-Organization-Id requis (uuid d'une organisation du référentiel).",
          corsHeaders,
        );
      }
      const { data: orgRows, error: orgRowsError } = await admin
        .from("organizations")
        .select("id, parent_id");
      if (orgRowsError) throw orgRowsError;
      const rootId = resolveRootOrgId((orgRows ?? []) as OrgParentRow[], requested);
      if (!rootId) {
        return errorResponse("not_found", "Organisation introuvable.", corsHeaders);
      }
      // Le budget d'une collectivité ne se débite que par les applications
      // qu'elle a souscrites (`application_scope_ids`) ; hors abonnement =
      // introuvable, comme hors référentiel.
      const { data: scopeRows, error: scopeError } = await admin.rpc("application_scope_ids", {
        p_application: consumer,
      });
      if (scopeError) {
        return errorResponse("internal_error", "Impossible de calculer le périmètre.", corsHeaders);
      }
      if (!(Array.isArray(scopeRows) && scopeRows.includes(rootId))) {
        return errorResponse("not_found", "Organisation introuvable.", corsHeaders);
      }
      orgId = rootId;
    }

    // Trace d'usage best-effort, au plus toutes les 5 minutes (shouldTouchKey)
    // et HORS du chemin de la réponse : une clé plateforme porte tout le trafic
    // public sur une seule ligne, l'écrire à chaque appel en attendant le
    // résultat coûtait une écriture et une latence par requête.
    if (shouldTouchKey(apiKey.last_used_at)) {
      const touch = admin.from("api_keys").update({ last_used_at: new Date().toISOString() })
        .eq("id", apiKey.id)
        .then(() => {}, () => {});
      (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(touch);
    }

    const segments = path.split("/").filter(Boolean);
    if (segments[0] !== "v1") {
      return errorResponse("not_found", "Endpoint inconnu.", corsHeaders);
    }

    const now = new Date();

    // ======================================================================
    // GET /v1/usage — ce que l'APPLICATION APPELANTE peut encore dépenser,
    // et ce que la collectivité a consommé, par qui
    //
    // ⚠️ Le point de vue est celui de l'appelant (2026-09-22, partage du
    // plafond) : les mêmes chiffres que le refus 429. Une application AVEC
    // part lit sa part ; une application SANS part lit le commun moins les
    // parts des autres. Sans aucune part active, rien ne change : c'est le
    // plafond de la collectivité, comme avant. `by_consumer`, lui, reste le
    // journal de toute la collectivité.
    // ======================================================================
    if (segments[1] === "usage" && segments.length === 2) {
      if (req.method !== "GET") {
        return errorResponse("method_not_allowed", "Seule la méthode GET est autorisée ici.", corsHeaders);
      }
      const url = new URL(req.url);
      const asked = url.searchParams.get("period");
      const period = asked && /^\d{4}-\d{2}$/.test(asked) ? asked : periodKey(now);

      const [{ data: quotas }, { data: counters }, { data: breakdown }, { data: shareRows }] =
        await Promise.all([
          admin.from("ai_usage_quotas")
            .select("provider, monthly_limit_tokens, is_active, updated_at")
            .eq("organization_id", orgId).eq("is_active", true),
          admin.from("ai_usage_counters")
            .select("provider, used_tokens, reserved_tokens")
            .eq("organization_id", orgId).eq("period", period),
          admin.rpc("ai_usage_breakdown", { p_org_id: orgId, p_period: period }),
          admin.rpc("ai_usage_shares", { p_org_id: orgId, p_period: period }),
        ]);

      const quota = (quotas ?? []).find((q) => q.provider === "__global__") ?? null;
      const counter = (counters ?? []).find((c) => c.provider === "__global__") ?? null;
      const shares = (shareRows ?? []) as ShareRow[];
      const own = shares.find((s) => s.consumer === consumer && s.effective_tokens !== null) ?? null;
      const commonLimit = quota?.monthly_limit_tokens ?? null;

      let limit: number | null;
      let used: number;
      let reserved: number;
      if (own) {
        // Une application avec part lit SA part : c'est elle qui la borne.
        limit = own.effective_tokens;
        used = own.used_tokens;
        reserved = own.reserved_tokens;
      } else {
        const others = othersEngaged(shares, consumer);
        limit = callerLimit(commonLimit, shares, consumer);
        used = Math.max((counter?.used_tokens ?? 0) - others.used, 0);
        reserved = Math.max((counter?.reserved_tokens ?? 0) - others.reserved, 0);
      }

      return jsonResponse(200, {
        organization_id: orgId,
        period,
        renews_at: nextRenewalIso(now),
        unlimited: limit === null,
        limit,
        used_tokens: used,
        reserved_tokens: reserved,
        remaining_tokens: limit === null ? null : Math.max(limit - used - reserved, 0),
        by_consumer: breakdown ?? [],
      }, corsHeaders);
    }

    // ======================================================================
    // POST /v1/completions — l'appel au fournisseur
    // ======================================================================
    if (segments[1] === "completions" && segments.length === 2) {
      if (req.method !== "POST") {
        return errorResponse("method_not_allowed", "Seule la méthode POST est autorisée ici.", corsHeaders);
      }

      // Après l'authentification : un appelant non authentifié n'apprend pas
      // si la plateforme est équipée d'un fournisseur.
      const providerKey = Deno.env.get("MISTRAL_API_KEY");
      if (!providerKey) {
        return errorResponse(
          "not_configured",
          "L'assistant IA n'est pas configuré sur cette plateforme.",
          corsHeaders,
        );
      }

      const raw = await req.json().catch(() => null);
      const parsed = parseCompletionPayload(raw, clampOutput);
      if (!parsed.ok) {
        return errorResponse("bad_request", parsed.message, corsHeaders);
      }
      const request = parsed.value;

      // Le plafond mensuel ne borne pas le coût d'UN appel ; ceci si.
      const inputTokens = estimateInput(request.system, request.messages);
      if (inputTokens > MAX_INPUT_TOKENS) {
        return errorResponse(
          "payload_too_large",
          `La requête dépasse la taille acceptée (${inputTokens} jetons estimés, maximum ${MAX_INPUT_TOKENS}).`,
          corsHeaders,
        );
      }

      const agentId = agentIdForAlias(request.agent);
      const estimate = reservationFor(request.system, request.messages, request.maxOutput, request.hint);

      // --- La réservation : LA porte ---------------------------------------
      const { data: reservation, error: reserveError } = await admin.rpc("reserve_ai_usage", {
        p_org_id: orgId,
        p_provider: PROVIDER_NAME,
        p_resource_type: agentId ? "agent" : "chat",
        p_estimated_tokens: estimate,
        p_consumer: consumer,
        p_api_key_id: apiKey.id,
        p_feature: request.feature,
        p_external_ref_kind: request.referenceKind,
        p_external_ref_id: request.referenceId,
        p_external_actor_id: request.actorId,
      });
      if (reserveError) {
        console.error(`${FUNCTION_NAME}: reserve_ai_usage en échec`, reserveError.message);
        return errorResponse("internal_error", "Erreur interne du serveur.", corsHeaders);
      }
      const reserved = (Array.isArray(reservation) ? reservation[0] : reservation) as
        | Reservation
        | null;

      if (!reserved?.allowed && reserved?.reason === "rate_limited") {
        console.warn(
          `${FUNCTION_NAME}: cadence dépassée — org=${orgId} consumer=${consumer} ` +
            `actor=${request.actorId ?? "-"}`,
        );
        return rateLimitedResponse(now, corsHeaders);
      }
      if (!reserved?.allowed) return quotaExceededResponse(reserved, now, corsHeaders);

      // --- L'appel, dans un module qui ne sait rien écrire ------------------
      const result = await callProvider({
        apiKey: providerKey,
        agentId,
        system: request.system,
        messages: request.messages,
        maxTokens: request.maxOutput,
        responseFormat: request.responseFormat,
      });

      if (!result.ok) {
        // Le détail vient du FOURNISSEUR (et a été neutralisé s'il contenait
        // notre requête). Jamais relayé à l'appelant.
        console.error(
          `${FUNCTION_NAME}: fournisseur en échec — event=${reserved.event_id} org=${orgId} ` +
            `consumer=${consumer} kind=${result.kind} status=${result.status ?? "-"} ${result.detail}`,
        );
        await admin.rpc("settle_ai_usage", {
          p_event_id: reserved.event_id, p_actual_tokens: null, p_status: "failed",
        });
        return errorResponse(
          "ai_unavailable",
          "L'assistant est momentanément indisponible — réessayez dans un instant.",
          corsHeaders,
        );
      }

      const { error: settleError } = await admin.rpc("settle_ai_usage", {
        p_event_id: reserved.event_id,
        p_actual_tokens: result.totalTokens,
        p_status: "completed",
      });
      if (settleError) {
        // La réponse EST là : un règlement raté ne doit pas la faire
        // disparaître. Le balayage cron rattrapera la réservation en 15 min —
        // la collectivité est alors sous-facturée, jamais sur-facturée.
        console.error(
          `${FUNCTION_NAME}: settle_ai_usage en échec — event=${reserved.event_id}`,
          settleError.message,
        );
      }

      const limit = reserved.limit_tokens ?? null;
      const usedAfter = limit === null ? null : (reserved.used_tokens ?? 0) + (result.totalTokens ?? estimate);
      return jsonResponse(200, {
        answer: result.answer,
        provider: PROVIDER_NAME,
        event_id: reserved.event_id,
        usage: {
          prompt_tokens: result.promptTokens,
          completion_tokens: result.completionTokens,
          total_tokens: result.totalTokens,
          estimated: result.totalTokens === null,
        },
        quota: {
          unlimited: limit === null,
          limit,
          used_tokens: usedAfter,
          period: reserved.usage_period,
          renews_at: reserved.renews_at,
        },
      }, corsHeaders);
    }

    // ======================================================================
    // POST /v1/ocr — la lecture d'un document scanné
    //
    // Même porte, même compteur, même plafond que les complétions : ce qui
    // change est l'unité chez le fournisseur (des pages, pas des jetons) et le
    // fait que le Socle NE VOIT PAS LE DOCUMENT — il transmet une URL signée
    // que le fournisseur va chercher. Le passe-plat est donc plus fort ici
    // qu'ailleurs : l'octet ne traverse pas le Socle.
    // ======================================================================
    if (segments[1] === "ocr" && segments.length === 2) {
      if (req.method !== "POST") {
        return errorResponse("method_not_allowed", "Seule la méthode POST est autorisée ici.", corsHeaders);
      }

      const providerKey = Deno.env.get("MISTRAL_API_KEY");
      if (!providerKey) {
        return errorResponse(
          "not_configured",
          "La lecture de documents n'est pas configurée sur cette plateforme.",
          corsHeaders,
        );
      }

      const raw = await req.json().catch(() => null);
      const parsed = parseOcrPayload(raw);
      if (!parsed.ok) {
        return errorResponse(parsed.code, parsed.message, corsHeaders);
      }
      const request = parsed.value;
      const estimate = reservationForOcr(request.pageHint);

      const { data: reservation, error: reserveError } = await admin.rpc("reserve_ai_usage", {
        p_org_id: orgId,
        p_provider: PROVIDER_NAME,
        p_resource_type: "ocr",
        p_estimated_tokens: estimate,
        p_consumer: consumer,
        p_api_key_id: apiKey.id,
        p_feature: request.feature,
        p_external_ref_kind: request.referenceKind,
        p_external_ref_id: request.referenceId,
        p_external_actor_id: request.actorId,
      });
      if (reserveError) {
        console.error(`${FUNCTION_NAME}: reserve_ai_usage (ocr) en échec`, reserveError.message);
        return errorResponse("internal_error", "Erreur interne du serveur.", corsHeaders);
      }
      const reserved = (Array.isArray(reservation) ? reservation[0] : reservation) as
        | Reservation
        | null;

      if (!reserved?.allowed && reserved?.reason === "rate_limited") {
        console.warn(
          `${FUNCTION_NAME}: cadence dépassée (ocr) — org=${orgId} consumer=${consumer} ` +
            `actor=${request.actorId ?? "-"}`,
        );
        return rateLimitedResponse(now, corsHeaders);
      }
      if (!reserved?.allowed) return quotaExceededResponse(reserved, now, corsHeaders);

      const result = await callProviderOcr({
        apiKey: providerKey,
        documentType: request.documentType,
        url: request.url,
      });

      if (!result.ok) {
        // Le détail vient du FOURNISSEUR, neutralisé s'il contenait l'URL
        // signée. Jamais relayé à l'appelant.
        console.error(
          `${FUNCTION_NAME}: fournisseur OCR en échec — event=${reserved.event_id} org=${orgId} ` +
            `consumer=${consumer} kind=${result.kind} status=${result.status ?? "-"} ${result.detail}`,
        );
        await admin.rpc("settle_ai_usage", {
          p_event_id: reserved.event_id, p_actual_tokens: null, p_status: "failed",
        });
        return errorResponse(
          "ai_unavailable",
          "La lecture de documents est momentanément indisponible — réessayez dans un instant.",
          corsHeaders,
        );
      }

      // Le texte fait foi pour le règlement, pas le nombre de pages : une page
      // blanche est facturée par le fournisseur et ne vaut rien à la
      // collectivité (voir `tokensForOcrText`).
      const text = result.pages.map((page) => page.markdown).join("\n\n---\n\n").trim();
      const actualTokens = tokensForOcrText(text);

      const { error: settleError } = await admin.rpc("settle_ai_usage", {
        p_event_id: reserved.event_id,
        p_actual_tokens: actualTokens,
        p_status: "completed",
      });
      if (settleError) {
        // Le texte EST là : un règlement raté ne doit pas le faire disparaître.
        console.error(
          `${FUNCTION_NAME}: settle_ai_usage (ocr) en échec — event=${reserved.event_id}`,
          settleError.message,
        );
      }

      const limit = reserved.limit_tokens ?? null;
      return jsonResponse(200, {
        text,
        pages: result.pages,
        page_count: result.pages.length,
        provider: PROVIDER_NAME,
        event_id: reserved.event_id,
        usage: {
          pages_processed: result.pagesProcessed,
          total_tokens: actualTokens,
          // Toujours vrai pour l'OCR : le fournisseur facture des pages, la
          // conversion en jetons est la nôtre. Le dire évite qu'un lecteur
          // prenne ce nombre pour une mesure du fournisseur.
          estimated: true,
        },
        quota: {
          unlimited: limit === null,
          limit,
          used_tokens: limit === null ? null : (reserved.used_tokens ?? 0) + actualTokens,
          period: reserved.usage_period,
          renews_at: reserved.renews_at,
        },
      }, corsHeaders);
    }

    return errorResponse("not_found", "Endpoint inconnu.", corsHeaders);
  } catch (err) {
    console.error(`${FUNCTION_NAME} error:`, err instanceof Error ? err.message : "inconnue");
    return errorResponse("internal_error", "Erreur interne du serveur.", corsHeaders);
  }
});
