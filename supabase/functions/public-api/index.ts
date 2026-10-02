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
  serializeBranding,
  serializeCategory,
  serializeDocumentTemplate,
  serializeDocumentType,
  serializeOrganization,
  serializePortalProcedure,
  serializePortalProcedureDetail,
  serializeProcedure,
  serializeQuartier,
  serializeSmtpSettings,
  serializeTenant,
} from "./_shared/serializers.ts";
import { buildOrganizationTree, isUuid } from "./_shared/scope.ts";
import { API_KEY_COLUMNS, evaluateApiKey, scopeRequest, shouldTouchKey, type ApiKeyRow } from "./_shared/apiKeyAuth.ts";
import { errorResponse, jsonResponse } from "./_shared/errors.ts";
import { buildOpenApiDocument } from "./_shared/openapi.ts";
import { isoDay } from "./_shared/publication.ts";
import { serializePortalPage } from "./_shared/portalPage.ts";
import { serializeAgentGuidance } from "./_shared/agentGuidance.ts";
import { serializePortalOrganizationsInfo, type UserInfoOrganization } from "./_shared/userInfo.ts";
import { serializeOrganizationAttributions, type AttributionsOrganization } from "./_shared/attributions.ts";
import { serializeIntegration, serializeOrganizationIntegration } from "./_shared/integrations.ts";
import {
  ACCESSIBILITY_STATEMENT_SLUG,
  hasPublishedContent,
  serializePortalContent,
} from "./_shared/portalContent.ts";
import {
  publishedCatalogue,
  type ProcedureBinding,
  type PublishedProcedure,
  type TreeOrganization,
} from "./_shared/portalCatalogue.ts";

const FUNCTION_NAME = "public-api";
const DOCUMENTS_BUCKET = "procedure-documents";
const TEMPLATES_BUCKET = "document-templates";
const SIGNED_URL_TTL_SECONDS = 300;

/**
 * FQDN en minuscules, au moins deux labels — miroir exact de la contrainte
 * `organization_domains_hostname_check`. Une entrée qui ne peut pas exister en
 * base est refusée avant la requête, en 400 : c'est une valeur malformée, pas
 * un domaine inconnu.
 */
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/**
 * Catalogue de documents du périmètre, indexé par identifiant : `serializeProcedure`
 * s'en sert pour résoudre le bloc « Documents et courriers ». Une seule requête,
 * y compris pour une liste de démarches — le motif de `list_quartiers_geojson`.
 */
async function loadTemplates(
  admin: ReturnType<typeof createClient>,
  orgIds: Array<string | null>,
): Promise<Map<string, Record<string, unknown>>> {
  const ids = orgIds.filter((id): id is string => typeof id === "string");
  if (ids.length === 0) return new Map();
  const { data, error } = await admin
    .from("document_templates")
    .select("*")
    .in("organization_id", ids);
  if (error) throw error;
  return new Map(
    ((data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row]),
  );
}

/**
 * Le catalogue PUBLIÉ du portail d'une collectivité — la seule lecture que
 * `/v1/portal/procedures` et `/v1/portal/page` partagent, pour qu'une
 * référence de page ne pointe jamais vers une démarche que la liste ne sert
 * pas. Les règles sont dans `publishedCatalogue` ; ici, les quatre lectures :
 *
 *   1. l'arbre du tenant (`org_subtree_ids`, lui compris) ;
 *   2. les organisations de cet arbre — pour leur nom, leur statut et l'ordre ;
 *   3. les activations (`organization_procedures`) portées par cet arbre ;
 *   4. le catalogue de la **racine** du tenant, à qui les démarches
 *      appartiennent (trigger `enforce_procedure_root_org`).
 *
 * La quatrième borne ce qu'une activation peut faire remonter : une liaison
 * vers la démarche d'une autre racine — que le RLS n'interdit pas d'écrire à
 * un admin — ne ferait pas apparaître sur ce portail le nom d'une démarche
 * qui n'est pas la sienne.
 */
async function loadPortalCatalogue(
  admin: ReturnType<typeof createClient>,
  tenantId: string,
): Promise<PublishedProcedure[]> {
  const { data: subtree, error: subtreeError } = await admin.rpc("org_subtree_ids", { root: tenantId });
  if (subtreeError) throw subtreeError;
  const treeIds = Array.isArray(subtree) ? (subtree as string[]) : [];
  if (treeIds.length === 0) return [];

  const { data: organizations, error: organizationsError } = await admin
    .from("organizations")
    // `is_internal_service` : un service interne ne s'affiche pas au portail,
    // c'est son porteur qui est nommé à sa place (`bearerByOrganization`) —
    // c'est donc aussi le slug du porteur qui sert d'adresse.
    .select("id, name, slug, logo_url, parent_id, status, is_internal_service")
    .in("id", treeIds);
  if (organizationsError) throw organizationsError;
  const tree = (organizations ?? []) as TreeOrganization[];

  const { data: bindings, error: bindingsError } = await admin
    .from("organization_procedures")
    .select("procedure_id, organization_id, is_enabled")
    .in("organization_id", treeIds)
    .eq("is_enabled", true);
  if (bindingsError) throw bindingsError;
  if (!bindings || bindings.length === 0) return [];

  // La racine du tenant : lui-même le plus souvent ; sinon on remonte
  // `parent_id` — dix niveaux au plus, le trigger `enforce_org_depth` y veille.
  let rootId = tenantId;
  let parentId = tree.find((org) => org.id === tenantId)?.parent_id ?? null;
  for (let depth = 0; parentId !== null && depth < 12; depth++) {
    rootId = parentId;
    const { data: parent, error: parentError } = await admin
      .from("organizations")
      .select("parent_id")
      .eq("id", parentId)
      .maybeSingle();
    if (parentError) throw parentError;
    parentId = (parent?.parent_id as string | null | undefined) ?? null;
  }

  const { data: procedures, error: proceduresError } = await admin
    .from("procedures")
    .select(
      // `requester_config` est lu pour en TIRER les publics (`audiences`) ; il
      // ne sort pas de la liste — voir `readAudiences`.
      "id, name, short_description, user_description, input_duration_minutes, " +
        "status, type, communication_config, order_index, translations, requester_config, " +
        // `access_mode` dit à quelles conditions l'usager dépose ; il ne filtre
        // RIEN — une démarche réservée reste au catalogue.
        "access_mode",
    )
    .eq("organization_id", rootId);
  if (proceduresError) throw proceduresError;

  // Jour de référence à PARIS : la fonction tourne en UTC, et une période
  // qui s'ouvre aujourd'hui doit s'ouvrir à minuit heure française.
  return publishedCatalogue({
    procedures: (procedures ?? []) as Array<Record<string, unknown>>,
    bindings: bindings as ProcedureBinding[],
    organizations: tree,
    today: isoDay(new Date()),
  });
}

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
    const { data: apiKeyRow } = await admin
      .from("api_keys")
      .select(API_KEY_COLUMNS)
      .eq("key_hash", keyHash)
      .maybeSingle();

    // La décision (révoquée, expirée, scope, clé plateforme sans application)
    // vit dans _shared/apiKeyAuth.ts, identique dans les trois fonctions.
    const decision = evaluateApiKey(apiKeyRow as ApiKeyRow | null, {
      requiredScope: "read",
      scopeMessage: "Cette clé ne porte pas le scope « read » requis pour le référentiel.",
    });
    if (!decision.ok) return errorResponse(decision.code, decision.message, corsHeaders);
    const apiKey = decision.key;

    // Trace best-effort (n'interrompt pas la requête en cas d'échec).
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

    // --- Périmètre : sous-arbre de l'organisation de la clé — ou, pour une
    // clé PLATEFORME, les sous-arbres des collectivités ABONNÉES à son
    // application (`application_scope_ids`, registre du 2026-09-08). « Toutes
    // les organisations » n'existe plus que pour le Socle lui-même
    // (application de scope `plateforme`). ---
    const scope = scopeRequest(apiKey);
    const { data: scopeRows, error: scopeError } = await admin.rpc(scope.rpc, scope.args);
    if (scopeError) {
      return errorResponse("internal_error", "Impossible de calculer le périmètre.", corsHeaders);
    }
    const scopeIds: string[] = Array.isArray(scopeRows) ? scopeRows : [];

    // Les parents servent à remonter à la racine d'un quartier demandé par
    // une clé plateforme. Métadonnées sans contenu, et l'organisation visée
    // est d'abord vérifiée dans le périmètre (`inScope`).
    let parentById: Map<string, string | null> = new Map();
    if (scope.kind === "platform") {
      const { data: allOrgs, error: allOrgsError } = await admin
        .from("organizations")
        .select("id, parent_id");
      if (allOrgsError) {
        return errorResponse("internal_error", "Impossible de calculer le périmètre.", corsHeaders);
      }
      const rows = (allOrgs ?? []) as Array<{ id: string; parent_id: string | null }>;
      parentById = new Map(rows.map((r) => [r.id, r.parent_id]));
    }
    const inScope = (id: string | null | undefined) => id != null && scopeIds.includes(id);

    const url = new URL(req.url);
    const segments = path.split("/").filter(Boolean); // ex. ["v1","organizations","<id>"]

    // --- /v1/portal/tenant ---
    // Résolution `domaine → collectivité` pour le portail usagers. C'est la
    // route qui permet à UNE instance de portail de servir toutes les
    // collectivités sans en connaître aucune : elle reçoit le nom d'hôte
    // visité, elle rend le tenant.
    //
    // Le nom d'hôte vient d'un navigateur : il est traité comme une donnée
    // NON FIABLE. Il n'ouvre d'accès à rien — il ne fait que désigner une ligne
    // de `organization_domains`, elle-même filtrée par le périmètre de la clé.
    // Un domaine inventé ne résout rien ; un domaine d'une autre collectivité
    // ne résout que si la clé la couvre déjà, et ne rend alors que ce que cette
    // collectivité publie de toute façon sur son propre portail.
    //
    // Trois refus, UN SEUL message : domaine inconnu, hors périmètre de la clé,
    // ou organisation obsolète répondent le même 404. Distinguer les cas ferait
    // de cette route un révélateur de l'existence des collectivités du
    // référentiel, domaine par domaine.
    //
    // Une organisation `obsolete` ne sert plus de portail : le référentiel la
    // garde pour l'historique des demandes, il n'en fait pas un guichet ouvert.
    if (segments[0] === "v1" && segments[1] === "portal" && segments[2] === "tenant") {
      if (segments.length !== 3) {
        return errorResponse("not_found", "Endpoint inconnu.", corsHeaders);
      }
      // Normalisation miroir du trigger `normalize_organization_domain` : la
      // table stocke la forme canonique, la comparaison se fait donc sur elle.
      // Le port est retiré — un navigateur de développement visite `:5175`.
      const rawHostname = (url.searchParams.get("hostname") ?? "").trim().toLowerCase();
      const hostname = rawHostname.replace(/:\d+$/, "").replace(/\.+$/, "");
      if (!HOSTNAME_RE.test(hostname) || hostname.length > 253) {
        return errorResponse("bad_request", "Paramètre hostname invalide.", corsHeaders);
      }

      const { data: domain, error: domainError } = await admin
        .from("organization_domains")
        .select("hostname, organization_id")
        .eq("hostname", hostname)
        .maybeSingle();
      if (domainError) throw domainError;
      if (!domain || !inScope(domain.organization_id as string)) {
        return errorResponse("not_found", "Aucune collectivité n'est rattachée à ce domaine.", corsHeaders);
      }

      const { data: org, error: orgError } = await admin
        .from("organizations")
        .select("id, name, slug, status")
        .eq("id", domain.organization_id)
        .maybeSingle();
      if (orgError) throw orgError;
      if (!org || org.status !== "active") {
        return errorResponse("not_found", "Aucune collectivité n'est rattachée à ce domaine.", corsHeaders);
      }

      // Langues de la collectivité — résolues en base (le réglage vit sur la
      // racine, le domaine peut désigner une sous-organisation). Un échec ne
      // ferme pas le portail : le sérialiseur retombe sur le français, qui est
      // la seule langue dont on est certain.
      const { data: languages } = await admin.rpc("resolve_org_languages", {
        p_org_id: org.id,
      });

      // Thème PUBLIÉ du site — jamais le brouillon, qui est une colonne
      // distincte et n'a pas de route. Il vit sur la racine, comme la page :
      // rien de publié (ou rien du tout) ⇒ le sérialiseur rend les défauts du
      // Socle, jamais `null`. Un échec de lecture ne ferme donc pas le portail.
      const { data: theme } = await admin
        .from("portal_themes")
        .select("published")
        .eq("organization_id", org.id)
        .maybeSingle();

      // La déclaration d'accessibilité PUBLIÉE — lue ici pour une seule raison :
      // décider si la mention du pied de page porte son lien. Le lien ne sort
      // que vers une déclaration non vide, jamais vers une page blanche. Même
      // organisation que le thème, et même tolérance : un échec de lecture ôte
      // le lien, il ne ferme pas le portail.
      const { data: statement } = await admin
        .from("portal_contents")
        .select("published")
        .eq("organization_id", org.id)
        .eq("slug", ACCESSIBILITY_STATEMENT_SLUG)
        .maybeSingle();

      // L'assistant du portail — réglé par le super admin sur la racine, donc
      // résolu en base comme les langues. Un échec de lecture ne ferme pas le
      // portail : il ferme l'ASSISTANT (le sérialiseur lit « rien » comme
      // « fermé »), ce qui est le bon côté où tomber quand un crédit est en jeu.
      const { data: assistant } = await admin.rpc("resolve_portal_assistant", {
        p_org_id: org.id,
      });

      return jsonResponse(
        200,
        serializeTenant(
          org,
          String(domain.hostname),
          languages,
          theme?.published ?? null,
          hasPublishedContent(statement?.published ?? null),
          assistant,
        ),
        corsHeaders,
      );
    }


    // --- /v1/portal/procedures ---
    // Démarches qu'un USAGER doit voir sur le portail de sa collectivité.
    //
    // Pourquoi cette route existe alors que `/v1/procedures` sert déjà les
    // démarches : ce que le portail a besoin de savoir (« qu'est-ce qui est
    // publié ? ») est une décision du SOCLE, pas un filtre à recopier chez
    // chaque consommateur. Quatre règles la composent — paramétrage `production`,
    // type `externe`, `visibility` du bloc communication (portail + période),
    // et activation par au moins un organisme de l'arbre du tenant — et un
    // portail qui les réimplémenterait finirait par diverger, en publiant trop
    // plutôt que trop peu. `publishedCatalogue` les écrit une fois.
    //
    // Et surtout : `ProcedureDto` porte le paramétrage d'INSTRUCTION
    // (form_schema, knowledge_base, agent_description, requester_config,
    // documents). Filtrer côté portail l'aurait déjà fait transiter par un
    // serveur public. Ici il ne sort pas du Socle.
    //
    // Chaque démarche dit qui la propose (`organizations`) : c'est ce qui fait
    // apparaître sur le portail de l'agglomération une démarche qu'une seule de
    // ses communes active, et ce sur quoi l'usager filtre.
    if (segments[0] === "v1" && segments[1] === "portal" && segments[2] === "procedures") {
      if (segments.length > 4) {
        return errorResponse("not_found", "Endpoint inconnu.", corsHeaders);
      }
      const tenantId = url.searchParams.get("tenant_id") ?? "";
      if (!isUuid(tenantId)) {
        return errorResponse("bad_request", "Paramètre tenant_id invalide.", corsHeaders);
      }
      if (!inScope(tenantId)) {
        return errorResponse("not_found", "Collectivité introuvable.", corsHeaders);
      }
      const catalogue = await loadPortalCatalogue(admin, tenantId);

      // --- /v1/portal/procedures/{id} ---
      // La démarche que l'usager va REMPLIR : le public de la liste, plus la
      // catégorie et les deux schémas de saisie (`form_schema`,
      // `requester_config`).
      //
      // Elle se sert du catalogue déjà chargé, et pas d'une lecture directe par
      // identifiant : la publication reste décidée au même endroit, par les
      // mêmes quatre règles. Une démarche absente du catalogue rend **404** —
      // le même que pour un identifiant inexistant, et le même que pour une
      // collectivité hors périmètre. Le portail n'apprend jamais qu'une
      // démarche existe mais n'est pas publiée : ce serait renseigner sur le
      // paramétrage d'une collectivité depuis un serveur public.
      //
      // Le `form_schema` n'est donc lu en base qu'APRÈS la décision de
      // publication : il ne peut pas sortir pour une démarche en brouillon.
      // Même chose pour `user_communication`, lu dans le même select.
      if (segments.length === 4) {
        const procedureId = segments[3];
        if (!isUuid(procedureId)) {
          return errorResponse("bad_request", "Identifiant de démarche invalide.", corsHeaders);
        }
        const entry = catalogue.find((candidate) => candidate.row.id === procedureId);
        if (!entry) {
          return errorResponse("not_found", "Démarche introuvable.", corsHeaders);
        }

        const { data: detail, error: detailError } = await admin
          .from("procedures")
          // ⚠️ Toute colonne absente de ce select arrive `undefined`, que le
          // sérialiseur transforme en `null` SANS erreur : le portail servirait
          // du vide, tests verts. Ajouter le champ au DTO ne suffit donc pas.
          .select("id, category_id, form_schema, requester_config, user_communication")
          .eq("id", procedureId)
          .maybeSingle();
        if (detailError) throw detailError;

        // La catégorie n'est qu'un libellé de plus sur la page ; son absence
        // n'empêche rien, et une démarche peut n'en avoir aucune.
        let category: Record<string, unknown> | null = null;
        const categoryId = detail?.category_id;
        if (typeof categoryId === "string" && categoryId !== "") {
          const { data: categoryRow, error: categoryError } = await admin
            .from("categories")
            .select("id, name, translations")
            .eq("id", categoryId)
            .maybeSingle();
          if (categoryError) throw categoryError;
          category = (categoryRow as Record<string, unknown> | null) ?? null;
        }

        return jsonResponse(
          200,
          serializePortalProcedureDetail(
            entry.row,
            entry.organizations,
            (detail as Record<string, unknown> | null) ?? null,
            category,
          ),
          corsHeaders,
        );
      }

      return jsonResponse(
        200,
        catalogue.map((entry) => serializePortalProcedure(entry.row, entry.organizations)),
        corsHeaders,
      );
    }

    // --- /v1/portal/page ---
    // La composition PUBLIÉE d'une page du portail — jamais le brouillon, qui
    // est une colonne distincte et n'a pas de route. Sauvegarder n'est pas
    // publier : c'est ici que la séparation devient visible de l'extérieur.
    //
    // 404 quand rien n'a jamais été publié : ce n'est pas une panne, c'est une
    // collectivité qui n'a pas encore composé sa page. Le portail rend alors sa
    // mise en page par défaut. Même 404 pour une collectivité hors périmètre —
    // la route ne révèle pas ce qui existe.
    //
    // Les références (`pinned`, `shortcuts`) sont résolues ICI contre le
    // catalogue publié — mêmes règles que /v1/portal/procedures — pour que le
    // consommateur ne reçoive jamais l'identifiant d'une démarche qu'il ne
    // saurait pas afficher.
    if (segments[0] === "v1" && segments[1] === "portal" && segments[2] === "page") {
      if (segments.length !== 3) {
        return errorResponse("not_found", "Endpoint inconnu.", corsHeaders);
      }
      const tenantId = url.searchParams.get("tenant_id") ?? "";
      if (!isUuid(tenantId)) {
        return errorResponse("bad_request", "Paramètre tenant_id invalide.", corsHeaders);
      }
      const slug = url.searchParams.get("slug") ?? "accueil";
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
        return errorResponse("bad_request", "Paramètre slug invalide.", corsHeaders);
      }
      if (!inScope(tenantId)) {
        return errorResponse("not_found", "Aucune page publiée.", corsHeaders);
      }
      const { data: page, error: pageError } = await admin
        .from("portal_pages")
        .select("published, published_at")
        .eq("organization_id", tenantId)
        .eq("slug", slug)
        .maybeSingle();
      if (pageError) throw pageError;
      if (!page || page.published === null || page.published_at === null) {
        return errorResponse("not_found", "Aucune page publiée.", corsHeaders);
      }

      const catalogue = await loadPortalCatalogue(admin, tenantId);
      const publishedIds = new Set(catalogue.map((entry) => String(entry.row.id)));

      return jsonResponse(
        200,
        serializePortalPage(
          page.published,
          { slug, published_at: String(page.published_at) },
          publishedIds,
        ),
        corsHeaders,
      );
    }

    // --- /v1/portal/content ---
    // Un contenu PUBLIÉ du site — une page de texte rédigée dans l'onglet
    // « Contenus » de l'éditeur. Aujourd'hui la seule : la déclaration
    // d'accessibilité, vers laquelle mène la mention du pied de page.
    //
    // 404 quand rien n'est publié, quand le texte publié est vide, ou pour une
    // collectivité hors périmètre — même réponse, la route ne révèle pas ce qui
    // existe. Le texte vide compte comme « rien » : publier le site publie aussi
    // une déclaration que personne n'a encore écrite, et la servir rendrait une
    // page blanche sous un titre engageant.
    if (segments[0] === "v1" && segments[1] === "portal" && segments[2] === "content") {
      if (segments.length !== 3) {
        return errorResponse("not_found", "Endpoint inconnu.", corsHeaders);
      }
      const tenantId = url.searchParams.get("tenant_id") ?? "";
      if (!isUuid(tenantId)) {
        return errorResponse("bad_request", "Paramètre tenant_id invalide.", corsHeaders);
      }
      const slug = url.searchParams.get("slug") ?? "";
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 64) {
        return errorResponse("bad_request", "Paramètre slug invalide.", corsHeaders);
      }
      if (!inScope(tenantId)) {
        return errorResponse("not_found", "Aucun contenu publié.", corsHeaders);
      }
      const { data: content, error: contentError } = await admin
        .from("portal_contents")
        .select("published, published_at")
        .eq("organization_id", tenantId)
        .eq("slug", slug)
        .maybeSingle();
      if (contentError) throw contentError;
      const dto = content && content.published_at !== null
        ? serializePortalContent(content.published, {
          slug,
          published_at: String(content.published_at),
        })
        : null;
      if (dto === null) {
        return errorResponse("not_found", "Aucun contenu publié.", corsHeaders);
      }
      return jsonResponse(200, dto, corsHeaders);
    }

    // --- /v1/portal/organizations ---
    // Les organismes du portail et ce qu'ils disent à leurs usagers :
    // descriptif, horaires d'accueil, FAQ (onglet « Informations usagers »,
    // 2026-09-24). Public par construction — c'est le corpus de l'assistant du
    // portail pour « à quelle heure ouvre la mairie ? », qui ne compose qu'à
    // partir des routes `/v1/portal/*`.
    //
    // Toute l'arborescence du tenant en une lecture : l'assistant ne sait pas
    // d'avance quel organisme l'usager a en tête. Ne sortent que les organismes
    // AFFICHÉS (actifs, pas service interne) qui ont écrit quelque chose —
    // `serializePortalOrganizationsInfo` en décide. Rien d'écrit ⇒ `[]`, pas un
    // 404 ; hors périmètre ⇒ 404, comme les autres routes du portail.
    if (segments[0] === "v1" && segments[1] === "portal" && segments[2] === "organizations") {
      if (segments.length !== 3) {
        return errorResponse("not_found", "Endpoint inconnu.", corsHeaders);
      }
      const tenantId = url.searchParams.get("tenant_id") ?? "";
      if (!isUuid(tenantId)) {
        return errorResponse("bad_request", "Paramètre tenant_id invalide.", corsHeaders);
      }
      if (!inScope(tenantId)) {
        return errorResponse("not_found", "Collectivité introuvable.", corsHeaders);
      }
      const { data: subtree, error: subtreeError } = await admin.rpc("org_subtree_ids", { root: tenantId });
      if (subtreeError) throw subtreeError;
      const treeIds = Array.isArray(subtree) ? (subtree as string[]) : [];
      if (treeIds.length === 0) return jsonResponse(200, [], corsHeaders);

      const { data: organizations, error: organizationsError } = await admin
        .from("organizations")
        .select("id, name, slug, parent_id, status, is_internal_service, phone, email")
        .in("id", treeIds);
      if (organizationsError) throw organizationsError;

      const { data: infoRows, error: infoError } = await admin
        .from("organization_user_info")
        .select("organization_id, info, updated_at")
        .in("organization_id", treeIds);
      if (infoError) throw infoError;

      return jsonResponse(
        200,
        serializePortalOrganizationsInfo(
          tenantId,
          (organizations ?? []) as UserInfoOrganization[],
          (infoRows ?? []) as Array<{ organization_id: unknown; info: unknown; updated_at: unknown }>,
        ),
        corsHeaders,
      );
    }

    // --- /v1/integrations ---
    // Le CATALOGUE des intégrations partenaires (ce que propose Edilumen) —
    // aucune donnée de collectivité, aucun secret : scope `read` suffit. La
    // configuration d'une collectivité est une autre route, gardée par le
    // scope `integrations`.
    if (segments.length === 2 && segments[0] === "v1" && segments[1] === "integrations") {
      const { data, error } = await admin
        .from("integrations")
        .select("*, integration_types(id, name), integration_applications(application_id)")
        .order("name");
      if (error) throw error;
      return jsonResponse(200, (data ?? []).map(serializeIntegration), corsHeaders);
    }

    // --- /v1/organizations/attributions?tenant_id= ---
    // Ce que traite chaque organisme du sous-arbre — INTERNE (agents et outils
    // IA, Clara d'abord), services internes COMPRIS. ⚠️ Avant la branche
    // `/v1/organizations/{id}`, qui lirait « attributions » comme un
    // identifiant invalide (400). Même forme que `/v1/portal/organizations` :
    // tableau nu, rien d'écrit ⇒ `[]`, hors périmètre ⇒ 404.
    if (
      segments.length === 3 &&
      segments[0] === "v1" &&
      segments[1] === "organizations" &&
      segments[2] === "attributions"
    ) {
      const tenantId = url.searchParams.get("tenant_id") ?? "";
      if (!isUuid(tenantId)) {
        return errorResponse("bad_request", "Paramètre tenant_id invalide.", corsHeaders);
      }
      if (!inScope(tenantId)) {
        return errorResponse("not_found", "Collectivité introuvable.", corsHeaders);
      }
      const { data: subtree, error: subtreeError } = await admin.rpc("org_subtree_ids", { root: tenantId });
      if (subtreeError) throw subtreeError;
      const treeIds = Array.isArray(subtree) ? (subtree as string[]) : [];
      if (treeIds.length === 0) return jsonResponse(200, [], corsHeaders);

      const { data: organizations, error: organizationsError } = await admin
        .from("organizations")
        .select("id, name, status, is_internal_service")
        .in("id", treeIds);
      if (organizationsError) throw organizationsError;

      const { data: rows, error: rowsError } = await admin
        .from("organization_attributions")
        .select("organization_id, attributions, updated_at")
        .in("organization_id", treeIds);
      if (rowsError) throw rowsError;

      return jsonResponse(
        200,
        serializeOrganizationAttributions(
          tenantId,
          (organizations ?? []) as AttributionsOrganization[],
          (rows ?? []) as Array<{ organization_id: unknown; attributions: unknown; updated_at: unknown }>,
        ),
        corsHeaders,
      );
    }

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
      // --- /v1/organizations/{id}/smtp ---
      // SEUL endpoint de cette API qui sert un secret (mot de passe du relais
      // de la collectivité). Deux gardes cumulatives, dans cet ordre :
      //   1. scope `smtp` explicite sur la clé — le scope `read` du référentiel
      //      NE suffit pas : une clé partenaire ne devient pas lectrice
      //      d'identifiants parce qu'elle lit les démarches ;
      //   2. organisation dans le périmètre de la clé (hors périmètre = 404,
      //      on ne révèle pas son existence) — `scopeIds` ne contient que des
      //      organisations existantes, la garde couvre donc aussi l'inconnu.
      // La réponse est le relais **applicable** à l'organisation demandée : le
      // sien, ou celui de l'ancêtre le plus proche dont elle hérite (héritage
      // Socle du 2026-08-23) ; `source_organization_id` dit lequel, pour que le
      // consommateur n'ait pas à remonter l'arbre. Une sous-organisation répond
      // donc 200 là où elle répondait 404 auparavant.
      if (segments.length === 4 && segments[3] === "smtp") {
        const id = segments[2];
        if (!isUuid(id)) {
          return errorResponse("bad_request", "Identifiant d'organisation invalide.", corsHeaders);
        }
        if (!Array.isArray(apiKey.scopes) || !apiKey.scopes.includes("smtp")) {
          return errorResponse(
            "forbidden",
            "Cette clé ne porte pas le scope « smtp » requis pour le serveur d'envoi.",
            corsHeaders,
          );
        }
        if (!inScope(id)) {
          return errorResponse("not_found", "Organisation introuvable.", corsHeaders);
        }
        // Résolution de l'héritage en base (`resolve_smtp_settings`, EXECUTE
        // réservé au service role) : une seule implémentation pour l'API, les
        // envois de mails du Socle et l'interface.
        const { data: smtpRows, error: smtpError } = await admin.rpc("resolve_smtp_settings", {
          p_org_id: id,
        });
        if (smtpError) throw smtpError;
        const smtp = Array.isArray(smtpRows) ? smtpRows[0] : smtpRows;
        return jsonResponse(200, serializeSmtpSettings(id, smtp ?? null), corsHeaders);
      }
      // --- /v1/organizations/{id}/integrations/{slug} ---
      // Configuration d'une intégration partenaire pour la collectivité de
      // l'organisation demandée, **secrets compris** — avec `/smtp`, la seule
      // sortie sensible de l'API. Mêmes gardes, dans le même ordre :
      //   1. scope `integrations` explicite (403) — `read` ne suffit pas ;
      //   2. organisation dans le périmètre (404, existence non révélée).
      // Une intégration se configure sur la RACINE : on la retrouve en
      // remontant l'arbre, `source_organization_id` la nomme.
      // Slug inconnu du catalogue → 404 ; rien de configuré → 200 et
      // `configured: false` (à ne pas confondre avec « hors périmètre »).
      if (segments.length === 5 && segments[3] === "integrations") {
        const id = segments[2];
        const slug = segments[4];
        if (!isUuid(id)) {
          return errorResponse("bad_request", "Identifiant d'organisation invalide.", corsHeaders);
        }
        if (!Array.isArray(apiKey.scopes) || !apiKey.scopes.includes("integrations")) {
          return errorResponse(
            "forbidden",
            "Cette clé ne porte pas le scope « integrations » requis pour la configuration des intégrations.",
            corsHeaders,
          );
        }
        if (!inScope(id)) {
          return errorResponse("not_found", "Organisation introuvable.", corsHeaders);
        }
        if (!/^[a-z][a-z0-9-]{1,63}$/.test(slug)) {
          return errorResponse("not_found", "Intégration introuvable.", corsHeaders);
        }

        // Racine : on remonte `parent_id` (10 niveaux au plus, `enforce_org_depth`).
        let rootId = id;
        for (let depth = 0; depth < 12; depth++) {
          const { data: org, error: orgError } = await admin
            .from("organizations")
            .select("parent_id")
            .eq("id", rootId)
            .maybeSingle();
          if (orgError) throw orgError;
          if (!org?.parent_id) break;
          rootId = org.parent_id as string;
        }

        const { data: integration, error: integrationError } = await admin
          .from("integrations")
          .select("id, slug, type_id, adapter, is_available")
          .eq("slug", slug)
          .maybeSingle();
        if (integrationError) throw integrationError;
        if (!integration) return errorResponse("not_found", "Intégration introuvable.", corsHeaders);

        const { data: config, error: configError } = await admin
          .from("organization_integrations")
          .select("id, settings, is_active, last_test_ok, last_tested_at, updated_at")
          .eq("organization_id", rootId)
          .eq("integration_id", integration.id)
          .maybeSingle();
        if (configError) throw configError;

        let secrets: Record<string, unknown> | null = null;
        if (config) {
          const { data: secretRow, error: secretError } = await admin
            .from("organization_integration_secrets")
            .select("secrets, updated_at")
            .eq("organization_integration_id", config.id)
            .maybeSingle();
          if (secretError) throw secretError;
          secrets = secretRow;
        }

        return jsonResponse(
          200,
          serializeOrganizationIntegration({ organizationId: id, rootId, integration, config, secrets }),
          corsHeaders,
        );
      }
      // --- /v1/organizations/{id}/branding ---
      // Charte graphique **applicable** : celle de l'organisation, ou celle de
      // l'ancêtre dont elle hérite (héritage Socle du 2026-08-30). Scope `read`
      // suffit — contrairement à /smtp, rien ici n'est un secret : logos et
      // couleurs sont faits pour être affichés.
      //
      // Pourquoi une route plutôt que quatre colonnes sur la fiche organisation :
      // une sous-organisation qui hérite porte des colonnes **nulles** en propre.
      // Servies brutes, le consommateur peindrait du vide au lieu de la charte de
      // sa collectivité. La remontée d'arbre est faite une fois, en base
      // (`resolve_branding`, EXECUTE réservé au service role), pas réécrite par
      // chaque application de la gamme.
      if (segments.length === 4 && segments[3] === "branding") {
        const id = segments[2];
        if (!isUuid(id)) {
          return errorResponse("bad_request", "Identifiant d'organisation invalide.", corsHeaders);
        }
        if (!inScope(id)) {
          return errorResponse("not_found", "Organisation introuvable.", corsHeaders);
        }
        const { data: brandingRows, error: brandingError } = await admin.rpc("resolve_branding", {
          p_org_id: id,
        });
        if (brandingError) throw brandingError;
        const branding = Array.isArray(brandingRows) ? brandingRows[0] : brandingRows;
        return jsonResponse(200, serializeBranding(id, branding ?? null), corsHeaders);
      }
      // --- /v1/organizations/{id}/agent-guidance ---
      // Recommandations aux agents **applicables** : celles de l'organisation
      // principale, pour toute organisation de son arbre (2026-09-19). Scope
      // `read` : c'est du référentiel INTERNE, comme `knowledge_base` — rien
      // ici n'est un secret, mais rien n'est destiné à l'usager non plus, et
      // aucune route `/v1/portal/*` ne le sert.
      //
      // Remontée à la racine faite en base (`resolve_agent_guidance`, EXECUTE
      // réservé au service role). Rien d'écrit ⇒ 200 `configured: false`, pas
      // un 404 : le 404 reste réservé au hors-périmètre.
      if (segments.length === 4 && segments[3] === "agent-guidance") {
        const id = segments[2];
        if (!isUuid(id)) {
          return errorResponse("bad_request", "Identifiant d'organisation invalide.", corsHeaders);
        }
        if (!inScope(id)) {
          return errorResponse("not_found", "Organisation introuvable.", corsHeaders);
        }
        const { data: guidanceRows, error: guidanceError } = await admin.rpc(
          "resolve_agent_guidance",
          { p_org_id: id },
        );
        if (guidanceError) throw guidanceError;
        const guidance = Array.isArray(guidanceRows) ? guidanceRows[0] : guidanceRows;
        return jsonResponse(200, serializeAgentGuidance(id, guidance ?? null), corsHeaders);
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
        const templates = await loadTemplates(admin, scopeIds);
        return jsonResponse(
          200,
          (data ?? []).map((row) => serializeProcedure(row, templates)),
          corsHeaders,
        );
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
        const templates = await loadTemplates(admin, [data.organization_id]);
        return jsonResponse(200, serializeProcedure(data, templates), corsHeaders);
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

    // --- /v1/document-templates ---
    if (segments[0] === "v1" && segments[1] === "document-templates") {
      if (segments.length === 2) {
        let query = admin.from("document_templates").select("*").in("organization_id", scopeIds);
        const type = url.searchParams.get("type");
        if (type !== null) {
          if (type !== "interne" && type !== "externe" && type !== "courrier") {
            return errorResponse(
              "bad_request",
              "Paramètre type invalide (interne, externe ou courrier).",
              corsHeaders,
            );
          }
          query = query.eq("type", type);
        }
        const { data, error } = await query.order("name", { ascending: true });
        if (error) throw error;
        return jsonResponse(200, (data ?? []).map(serializeDocumentTemplate), corsHeaders);
      }

      const id = segments[2];
      if (!isUuid(id)) {
        return errorResponse("bad_request", "Identifiant de document invalide.", corsHeaders);
      }
      const { data, error } = await admin
        .from("document_templates")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      // Hors périmètre = 404 : on ne révèle pas l'existence du document.
      if (!data || !inScope(data.organization_id)) {
        return errorResponse("not_found", "Document introuvable.", corsHeaders);
      }

      if (segments.length === 3) {
        return jsonResponse(200, serializeDocumentTemplate(data), corsHeaders);
      }

      // --- /v1/document-templates/{id}/signed-url ---
      // Le chemin de stockage reste interne : le périmètre est vérifié sur la
      // ligne, pas sur une chaîne fournie par l'appelant.
      if (segments.length === 4 && segments[3] === "signed-url") {
        const { data: signed, error: signErr } = await admin.storage
          .from(TEMPLATES_BUCKET)
          .createSignedUrl(String(data.file_path), SIGNED_URL_TTL_SECONDS);
        if (signErr || !signed) {
          return errorResponse("not_found", "Fichier introuvable.", corsHeaders);
        }
        return jsonResponse(
          200,
          {
            url: signed.signedUrl,
            file_name: String(data.file_name),
            expires_at: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
          },
          corsHeaders,
        );
      }
    }

    // --- /v1/quartiers ---
    if (segments[0] === "v1" && segments[1] === "quartiers" && segments.length === 2) {
      const { data, error } = await admin
        .from("quartiers")
        .select("*")
        .in("organization_id", scopeIds)
        .order("name", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      if (url.searchParams.get("geometry") !== "true") {
        return jsonResponse(200, rows.map((r) => serializeQuartier(r)), corsHeaders);
      }
      // Géométries via la RPC (cast ST_AsGeoJSON côté serveur — `geom` est du
      // binaire PostGIS). Les quartiers n'existent que sur les organisations
      // principales : clé liée → celle de la clé couvre le périmètre ; clé
      // plateforme → l'organisation visée arrive en paramètre `organization_id`
      // (sa racine est utilisée).
      let quartiersOrgId: string | null = apiKey.organization_id;
      if (quartiersOrgId === null) {
        const requested = url.searchParams.get("organization_id");
        if (!requested || !isUuid(requested) || !inScope(requested)) {
          return errorResponse(
            "bad_request",
            "Clé plateforme : paramètre organization_id requis pour les géométries de quartiers.",
            corsHeaders,
          );
        }
        let current = requested;
        const seen = new Set<string>([current]);
        for (;;) {
          const parent = parentById.get(current) ?? null;
          if (!parent || seen.has(parent)) break;
          seen.add(parent);
          current = parent;
        }
        quartiersOrgId = current;
      }
      const { data: geo, error: geoErr } = await admin.rpc("list_quartiers_geojson", {
        p_org_id: quartiersOrgId,
      });
      if (geoErr) throw geoErr;
      const geometryById = new Map(
        ((geo ?? []) as Array<{ id: string; geojson: unknown }>).map((g) => [String(g.id), g.geojson]),
      );
      return jsonResponse(
        200,
        rows.map((r) => serializeQuartier(r, geometryById.get(String(r.id)) ?? null)),
        corsHeaders,
      );
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
