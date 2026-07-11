/**
 * API publique Socle — passerelle REST **en lecture seule** (GET) exposant le
 * référentiel (organisations, démarches, catégories, types de pièce) à des
 * consommateurs serveur-à-serveur (Ariane, Clara, partenaires).
 *
 * Auth : clé API en `Authorization: Bearer <clé>` (hachée SHA-256, table
 * `api_keys`). Déployée avec `verify_jwt = false` — l'auth est portée ici.
 *
 * Isolation : la fonction lit avec la **service role** (hors RLS) mais restreint
 * chaque requête au **sous-arbre** de l'organisation de la clé (`org_subtree_ids`).
 * C'est LE point où l'isolation vit → couvert par les tests des sérialiseurs et
 * du scope, et par la vérification bout en bout.
 *
 * La logique pure (sérialiseurs, arbre, erreurs, OpenAPI) vit dans `_shared/`
 * (sans dépendance Deno) : testée par vitest et déployée avec cette fonction.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  serializeCategory,
  serializeDocumentType,
  serializeOrganization,
  serializeProcedure,
} from "./_shared/serializers.ts";
import { buildOrganizationTree, isUuid } from "./_shared/scope.ts";
import { errorResponse, jsonResponse } from "./_shared/errors.ts";
import { buildOpenApiDocument } from "./_shared/openapi.ts";

const FUNCTION_NAME = "public-api";
const DOCUMENTS_BUCKET = "procedure-documents";
const SIGNED_URL_TTL_SECONDS = 300;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/** SHA-256 hexadécimal (même algorithme que la génération côté navigateur). */
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

interface RouteInfo {
  /** Chemin applicatif, ex. "/v1/organizations" (préfixe fonction retiré). */
  path: string;
  /** URL de base publique de la fonction (pour l'OpenAPI / Redoc). */
  serverUrl: string;
}

function parseRoute(req: Request): RouteInfo {
  const url = new URL(req.url);
  const marker = `/${FUNCTION_NAME}`;
  const idx = url.pathname.indexOf(marker);
  const prefixEnd = idx >= 0 ? idx + marker.length : 0;
  let path = url.pathname.slice(prefixEnd);
  if (path === "") path = "/";
  // La passerelle Supabase retire `/functions/v1` et termine le TLS : on
  // reconstruit l'URL publique à partir des en-têtes transmis + du préfixe fixe.
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(/:$/, "");
  const host = req.headers.get("x-forwarded-host") ?? url.host;
  const serverUrl = `${proto}://${host}/functions/v1/${FUNCTION_NAME}`;
  return { path, serverUrl };
}

function redocHtml(serverUrl: string): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Socle — Documentation</title>
    <style>body { margin: 0; padding: 0; }</style>
  </head>
  <body>
    <redoc spec-url="${serverUrl}/openapi.json"></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { path, serverUrl } = parseRoute(req);

  // --- Endpoints publics (documentation) ---------------------------------
  if (path === "/" || path === "/v1") {
    return jsonResponse(
      200,
      {
        name: "API Socle — Référentiel",
        description: "API en lecture seule. Voir la documentation.",
        documentation: `${serverUrl}/docs`,
        openapi: `${serverUrl}/openapi.json`,
      },
      corsHeaders,
    );
  }
  if (path === "/openapi.json") {
    return jsonResponse(200, buildOpenApiDocument(serverUrl), corsHeaders);
  }
  if (path === "/docs") {
    return new Response(redocHtml(serverUrl), {
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // --- À partir d'ici : endpoints de données (GET + clé API) -------------
  if (req.method !== "GET") {
    return errorResponse("method_not_allowed", "Seule la méthode GET est autorisée.", corsHeaders);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // --- Authentification par clé API ---
    const token = bearerToken(req.headers.get("Authorization"));
    if (!token) {
      return errorResponse("unauthorized", "Clé API manquante (Authorization: Bearer).", corsHeaders);
    }
    const keyHash = await sha256Hex(token);
    const { data: apiKey } = await admin
      .from("api_keys")
      .select("id, organization_id, revoked_at, expires_at")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (
      !apiKey ||
      apiKey.revoked_at !== null ||
      (apiKey.expires_at !== null && new Date(apiKey.expires_at).getTime() < Date.now())
    ) {
      return errorResponse("unauthorized", "Clé API invalide, révoquée ou expirée.", corsHeaders);
    }

    // Trace best-effort (n'interrompt pas la requête en cas d'échec).
    try {
      await admin
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", apiKey.id);
    } catch (_) {
      // ignoré
    }

    // --- Périmètre (sous-arbre de l'organisation de la clé) ---
    const { data: subtree, error: subtreeError } = await admin.rpc("org_subtree_ids", {
      root: apiKey.organization_id,
    });
    if (subtreeError) {
      return errorResponse("internal_error", "Impossible de calculer le périmètre.", corsHeaders);
    }
    const scopeIds: string[] = Array.isArray(subtree) ? subtree : [];
    const inScope = (id: string | null | undefined) => id != null && scopeIds.includes(id);

    const url = new URL(req.url);
    const segments = path.split("/").filter(Boolean); // ex. ["v1","organizations","<id>"]

    // --- /v1/organizations ---
    if (segments[0] === "v1" && segments[1] === "organizations") {
      if (segments.length === 2) {
        const status = url.searchParams.get("status");
        let query = admin.from("organizations").select("*").in("id", scopeIds);
        if (status === "active" || status === "obsolete") query = query.eq("status", status);
        const { data, error } = await query;
        if (error) throw error;
        const orgs = (data ?? []).map(serializeOrganization);
        if (url.searchParams.get("tree") === "true") {
          return jsonResponse(200, buildOrganizationTree(orgs), corsHeaders);
        }
        return jsonResponse(200, orgs, corsHeaders);
      }
      if (segments.length === 3) {
        const id = segments[2];
        if (!isUuid(id)) {
          return errorResponse("bad_request", "Identifiant d'organisation invalide.", corsHeaders);
        }
        if (!inScope(id)) {
          return errorResponse("not_found", "Organisation introuvable.", corsHeaders);
        }
        const { data, error } = await admin.from("organizations").select("*").eq("id", id).maybeSingle();
        if (error) throw error;
        if (!data) return errorResponse("not_found", "Organisation introuvable.", corsHeaders);
        return jsonResponse(200, serializeOrganization(data), corsHeaders);
      }
    }

    // --- /v1/categories ---
    if (segments[0] === "v1" && segments[1] === "categories" && segments.length === 2) {
      const { data, error } = await admin
        .from("categories")
        .select("*")
        .in("organization_id", scopeIds)
        .order("name", { ascending: true });
      if (error) throw error;
      return jsonResponse(200, (data ?? []).map(serializeCategory), corsHeaders);
    }

    // --- /v1/procedures ---
    if (segments[0] === "v1" && segments[1] === "procedures") {
      if (segments.length === 2) {
        const categoryId = url.searchParams.get("category_id");
        const type = url.searchParams.get("type");
        const enabledFor = url.searchParams.get("enabled_for");

        let enabledIds: string[] | null = null;
        if (enabledFor) {
          if (!isUuid(enabledFor)) {
            return errorResponse("bad_request", "Paramètre enabled_for invalide.", corsHeaders);
          }
          if (!inScope(enabledFor)) {
            return errorResponse("not_found", "Organisation introuvable.", corsHeaders);
          }
          const { data: bindings, error: bErr } = await admin
            .from("organization_procedures")
            .select("procedure_id")
            .eq("organization_id", enabledFor)
            .eq("is_enabled", true);
          if (bErr) throw bErr;
          enabledIds = (bindings ?? [])
            .map((b: { procedure_id: string | null }) => b.procedure_id)
            .filter((v: string | null): v is string => v !== null);
        }

        let query = admin.from("procedures").select("*").in("organization_id", scopeIds);
        if (categoryId) {
          if (!isUuid(categoryId)) {
            return errorResponse("bad_request", "Paramètre category_id invalide.", corsHeaders);
          }
          query = query.eq("category_id", categoryId);
        }
        if (type === "interne" || type === "externe") query = query.eq("type", type);
        if (enabledIds !== null) {
          if (enabledIds.length === 0) return jsonResponse(200, [], corsHeaders);
          query = query.in("id", enabledIds);
        }
        const { data, error } = await query.order("order_index", { ascending: true });
        if (error) throw error;
        return jsonResponse(200, (data ?? []).map(serializeProcedure), corsHeaders);
      }
      if (segments.length === 3) {
        const id = segments[2];
        if (!isUuid(id)) {
          return errorResponse("bad_request", "Identifiant de démarche invalide.", corsHeaders);
        }
        const { data, error } = await admin.from("procedures").select("*").eq("id", id).maybeSingle();
        if (error) throw error;
        if (!data || !inScope(data.organization_id)) {
          return errorResponse("not_found", "Démarche introuvable.", corsHeaders);
        }
        return jsonResponse(200, serializeProcedure(data), corsHeaders);
      }
    }

    // --- /v1/document-types ---
    if (segments[0] === "v1" && segments[1] === "document-types" && segments.length === 2) {
      const { data, error } = await admin
        .from("document_types")
        .select("*")
        .in("organization_id", scopeIds)
        .order("name", { ascending: true });
      if (error) throw error;
      return jsonResponse(200, (data ?? []).map(serializeDocumentType), corsHeaders);
    }

    // --- /v1/documents/signed-url ---
    if (
      segments[0] === "v1" &&
      segments[1] === "documents" &&
      segments[2] === "signed-url" &&
      segments.length === 3
    ) {
      const docPath = url.searchParams.get("path");
      if (!docPath) {
        return errorResponse("bad_request", "Paramètre path requis.", corsHeaders);
      }
      const orgSegment = docPath.split("/")[0] ?? "";
      if (!isUuid(orgSegment)) {
        return errorResponse("bad_request", "Chemin de document invalide.", corsHeaders);
      }
      if (!inScope(orgSegment)) {
        return errorResponse("forbidden", "Ce document est hors de votre périmètre.", corsHeaders);
      }
      const { data, error } = await admin.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUrl(docPath, SIGNED_URL_TTL_SECONDS);
      if (error || !data) {
        return errorResponse("not_found", "Document introuvable.", corsHeaders);
      }
      return jsonResponse(
        200,
        {
          url: data.signedUrl,
          expires_at: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
        },
        corsHeaders,
      );
    }

    return errorResponse("not_found", "Endpoint inconnu.", corsHeaders);
  } catch (err) {
    console.error("public-api error:", err);
    return errorResponse("internal_error", "Erreur interne du serveur.", corsHeaders);
  }
});
