/**
 * API Audience Socle — les compteurs de fréquentation du site de démarches.
 *
 * Nora tourne dans le navigateur de l'usager et n'a **pas de base de données**.
 * Le Socle détient déjà le domaine, le catalogue et la page publiée : c'est
 * donc ici que se compte la fréquentation, et nulle part ailleurs.
 *
 * POURQUOI UNE QUATRIÈME FONCTION plutôt qu'une route de plus : `public-api`
 * refuse tout ce qui n'est pas GET — cette ligne EST son contrat pour tous ses
 * consommateurs ; `contacts-api` est la surface des données personnelles ;
 * `ai-api` celle de la dépense. Quatrième domaine, quatrième fonction,
 * quatrième scope (`audience`) : c'est déjà la décision de la maison.
 *
 * ⚠️ CETTE FONCTION NE REÇOIT AUCUNE DONNÉE PERSONNELLE, ET NE PEUT PAS EN
 * RECEVOIR. La promesse n'est pas déclarative, elle est tenue par quatre
 * mécanismes, du plus fort au plus faible :
 *   1. LE SCHÉMA — les deux tables n'ont aucune colonne capable de porter un
 *      identifiant, une adresse ou un texte libre. Épinglé par
 *      `supabase/tests/audience.test.sql` (cas R1), qui fige la liste EXACTE
 *      des colonnes.
 *   2. LES SIGNATURES DE RPC — deux uuid, trois énumérés courts, un booléen.
 *      Elles seules écrivent ; aucune écriture directe ici.
 *   3. LA WHITELIST DU CORPS — toute clé inconnue est un 400
 *      (`_shared/validation.ts`). Un appelant qui enverrait `visitor_id`
 *      l'apprend par un refus, jamais par un silence.
 *   4. `_shared/privacy.test.ts` — il lit ce fichier et interdit qu'on lise
 *      jamais `user-agent`, `referer` ou une IP, et qu'un journal sérialise le
 *      corps. Grossier, assumé, et c'est celui qui sert le jour où quelqu'un
 *      débogue.
 *
 * ⚠️ ÉCRITURE SEULE, ET ÇA N'EST PAS UN OUBLI. La clé `audience` de Nora ne
 * doit pouvoir que compter. Les chiffres se lisent dans le Socle, par les RPC
 * `organization_dashboard` et `portal_audience`, avec le compte de l'agent —
 * une clé volée ne raconte donc rien de la fréquentation d'une collectivité.
 *
 * ⚠️ AUCUN FREIN DE CADENCE ICI, et c'est délibéré : le freiner utilement
 * demanderait l'adresse IP du visiteur, précisément ce que le Socle ne doit
 * jamais voir. Le frein vit chez `portal-api`, au plus près de l'adresse, qui
 * la hache en mémoire et la jette. Ce qui reste ici est le périmètre de la clé.
 *
 * Déployée avec `verify_jwt = false` (l'auth est portée par la fonction).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { errorResponse, jsonResponse } from "./_shared/errors.ts";
import { buildOpenApiDocument } from "./_shared/openapi.ts";
import { parseDepositPayload, parsePageViewPayload } from "./_shared/validation.ts";
import {
  API_KEY_COLUMNS,
  evaluateApiKey,
  scopeRequest,
  type ApiKeyRow,
} from "./_shared/apiKeyAuth.ts";

const FUNCTION_NAME = "audience-api";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  // reconstruit l'URL publique à partir des en-têtes transmis + du préfixe FIXE
  // (motif `public-api`, `contacts-api`, `ai-api`).
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(/:$/, "");
  const host = req.headers.get("x-forwarded-host") ?? url.host;
  return { path, serverUrl: `${proto}://${host}/functions/v1/${FUNCTION_NAME}` };
}

/**
 * 202 et non 200 : l'appelant n'attend rien de nous, et il ne doit surtout pas
 * retarder une page pour un compteur. `recorded: false` n'est pas une erreur —
 * c'est une démarche qui n'appartient pas au tenant, écartée sans bruit.
 */
function accepted(recorded: boolean): Response {
  return jsonResponse(202, { recorded }, { ...corsHeaders, "Cache-Control": "no-store" });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { path, serverUrl } = parseRoute(req);

  // --- Endpoints publics (documentation) -----------------------------------
  if (path === "/" || path === "/v1") {
    return jsonResponse(200, {
      name: "API Audience Socle — fréquentation du site de démarches",
      description:
        "Compteurs de fréquentation du portail usagers. Écriture seule. Aucune donnée " +
        "personnelle : ni identifiant de visiteur, ni adresse, ni User-Agent, ni référent.",
      openapi: `${serverUrl}/openapi.json`,
    }, corsHeaders);
  }
  if (path === "/openapi.json") {
    return jsonResponse(200, buildOpenApiDocument(serverUrl), corsHeaders);
  }

  if (req.method !== "POST") {
    return errorResponse(
      "method_not_allowed",
      "Seule la méthode POST est autorisée : cette API compte, elle ne rend rien.",
      corsHeaders,
    );
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- Authentification par clé API + scope `audience` -------------------
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
    // vit dans _shared/apiKeyAuth.ts, identique dans les quatre fonctions.
    const decision = evaluateApiKey(apiKeyRow as ApiKeyRow | null, {
      requiredScope: "audience",
      scopeMessage:
        "Cette clé ne porte pas le scope « audience » requis pour la mesure de fréquentation.",
    });
    if (!decision.ok) return errorResponse(decision.code, decision.message, corsHeaders);
    const apiKey = decision.key;

    const segments = path.split("/").filter(Boolean);
    const route = segments[0] === "v1" && segments.length === 2 ? segments[1] : "";
    if (route !== "page-views" && route !== "deposits") {
      return errorResponse("not_found", "Endpoint inconnu.", corsHeaders);
    }

    const raw = await req.json().catch(() => null);

    /**
     * Le périmètre de la clé : le sous-arbre de sa racine (clé liée), ou les
     * collectivités abonnées à son application (clé plateforme). La RPC à
     * appeler est désignée par `scopeRequest`, identique dans les quatre
     * fonctions.
     *
     * ⚠️ Le `tenant_id` vient du CORPS, contrairement à `ai-api` où il vient
     * d'un en-tête : ici l'appelant est un relais (`portal-api`) qui compte
     * pour beaucoup de collectivités depuis le même isolat, et le tenant est
     * une propriété de l'ÉVÉNEMENT, pas de la requête. C'est précisément pour
     * cela qu'il est recoupé avec le périmètre, sans exception.
     */
    const inScope = async (tenantId: string): Promise<boolean | null> => {
      const scope = scopeRequest(apiKey);
      const { data, error } = await admin.rpc(scope.rpc, scope.args);
      if (error) {
        console.error(`${FUNCTION_NAME}: périmètre illisible`, error.message);
        return null;
      }
      return Array.isArray(data) && (data as unknown[]).includes(tenantId);
    };

    // Trace best-effort (n'interrompt jamais la requête).
    const touchKey = async () => {
      try {
        await admin.from("api_keys").update({ last_used_at: new Date().toISOString() })
          .eq("id", apiKey.id);
      } catch (_) {
        // ignoré
      }
    };

    // ======================================================================
    // POST /v1/page-views — un écran affiché
    // ======================================================================
    if (route === "page-views") {
      const parsed = parsePageViewPayload(raw);
      if (!parsed.ok) return errorResponse("bad_request", parsed.message, corsHeaders);
      const view = parsed.value;

      const ok = await inScope(view.tenantId);
      if (ok === null) {
        return errorResponse("internal_error", "Impossible de calculer le périmètre.", corsHeaders);
      }
      // Hors périmètre = introuvable : on ne renseigne pas sur l'existence des
      // collectivités (motif `public-api`).
      if (!ok) return errorResponse("not_found", "Organisation introuvable.", corsHeaders);

      const { data, error } = await admin.rpc("record_portal_page_view", {
        p_organization_id: view.tenantId,
        p_page: view.page,
        p_procedure_id: view.procedureId,
        p_entry: view.entry,
        p_lang: view.lang,
        p_device: view.device,
      });
      if (error) {
        console.error(`${FUNCTION_NAME}: record_portal_page_view en échec`, error.message);
        return errorResponse("internal_error", "Erreur interne du serveur.", corsHeaders);
      }
      await touchKey();
      return accepted(data === true);
    }

    // ======================================================================
    // POST /v1/deposits — une demande effectivement déposée
    // ======================================================================
    const parsed = parseDepositPayload(raw);
    if (!parsed.ok) return errorResponse("bad_request", parsed.message, corsHeaders);
    const deposit = parsed.value;

    const ok = await inScope(deposit.tenantId);
    if (ok === null) {
      return errorResponse("internal_error", "Impossible de calculer le périmètre.", corsHeaders);
    }
    if (!ok) return errorResponse("not_found", "Organisation introuvable.", corsHeaders);

    const { data, error } = await admin.rpc("record_portal_deposit", {
      p_organization_id: deposit.tenantId,
      p_procedure_id: deposit.procedureId,
    });
    if (error) {
      console.error(`${FUNCTION_NAME}: record_portal_deposit en échec`, error.message);
      return errorResponse("internal_error", "Erreur interne du serveur.", corsHeaders);
    }
    await touchKey();
    return accepted(data === true);
  } catch (err) {
    console.error(`${FUNCTION_NAME} error:`, err instanceof Error ? err.message : "inconnue");
    return errorResponse("internal_error", "Erreur interne du serveur.", corsHeaders);
  }
});
