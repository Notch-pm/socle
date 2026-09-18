/**
 * API usagers Socle — passerelle REST du **référentiel des contacts** :
 * consulter, créer, modifier et **archiver** (obsolescence réversible) un
 * usager. **Aucune suppression** via cette API.
 *
 * Auth : clé API en `Authorization: Bearer <clé>` (hachée SHA-256, table
 * `api_keys`), qui doit porter le **scope `contacts`** (données personnelles —
 * les clés de lecture du référentiel général ne suffisent pas). Déployée avec
 * `verify_jwt = false` — l'auth est portée ici.
 *
 * Isolation : la fonction écrit avec la **service role** (hors RLS) mais borne
 * chaque requête à une organisation **racine** (les contacts y sont rattachés
 * par trigger DB) — pas de sous-arbre. Clé **liée** : égalité stricte
 * `organization_id = clé.organization_id`. Clé **plateforme**
 * (`organization_id` NULL — liaison unique Socle↔Clara, multi-tenant des deux
 * côtés) : la racine servie est celle de l'organisation portée par l'en-tête
 * `X-Organization-Id` (requis). C'est LE point où l'isolation vit → vérifié
 * bout en bout.
 *
 * La logique pure (validation, sérialiseurs, erreurs, OpenAPI) vit dans
 * `_shared/` (sans dépendance Deno) : testée par vitest et déployée avec la
 * fonction.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  serializeContact,
  serializeContactRole,
} from "./_shared/serializers.ts";
import {
  CONTACT_TYPES,
  contactInvariantError,
  coordinatesPairError,
  escapeIlikePattern,
  isUuid,
  mergeContactShape,
  normalizePhoneNumber,
  parseConsentsPayload,
  parseContactPayload,
  parseMatchPayload,
  parsePagination,
  resolveRootOrgId,
  type ExternalRefInput,
  type OrgParentRow,
  type RelationInput,
} from "./_shared/validation.ts";
import { API_KEY_COLUMNS, evaluateApiKey, type ApiKeyRow } from "./_shared/apiKeyAuth.ts";
import {
  addressTouched,
  BAN_SEARCH_URL,
  buildGeocodeQuery,
  parseBanResult,
  type GeocodableAddress,
} from "./_shared/geocoding.ts";
import { errorResponse, jsonResponse } from "./_shared/errors.ts";
import { buildOpenApiDocument } from "./_shared/openapi.ts";

const FUNCTION_NAME = "contacts-api";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-organization-id",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

type Row = Record<string, unknown>;
// deno-lint-ignore no-explicit-any
type AdminClient = any;

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

function parseRoute(req: Request): { path: string; serverUrl: string } {
  const url = new URL(req.url);
  const marker = `/${FUNCTION_NAME}`;
  const idx = url.pathname.indexOf(marker);
  const prefixEnd = idx >= 0 ? idx + marker.length : 0;
  let path = url.pathname.slice(prefixEnd);
  if (path === "") path = "/";
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(/:$/, "");
  const host = req.headers.get("x-forwarded-host") ?? url.host;
  const serverUrl = `${proto}://${host}/functions/v1/${FUNCTION_NAME}`;
  return { path, serverUrl };
}

/** Erreur Postgres (via PostgREST) → réponse API. */
function writeErrorResponse(err: unknown): Response {
  const pg = err as { code?: string; message?: string };
  if (pg?.code === "23505") {
    const message = String(pg.message ?? "");
    let detail = "Conflit d'unicité.";
    if (message.includes("contacts_org_siret_unique")) {
      detail = "Un contact avec ce SIRET existe déjà dans cette organisation.";
    } else if (message.includes("contact_external_refs_org_source_ext_unique")) {
      detail = "Cet identifiant externe est déjà rattaché à un autre contact de l'organisation.";
    } else if (message.includes("contact_external_references_contact_source_unique")) {
      detail = "Ce contact a déjà une référence pour cette source.";
    }
    return errorResponse("conflict", detail, corsHeaders);
  }
  if (pg?.code === "23514" || pg?.code === "23503") {
    return errorResponse("bad_request", "Données invalides (contrainte de la base).", corsHeaders);
  }
  console.error("contacts-api write error:", err);
  return errorResponse("internal_error", "Erreur interne du serveur.", corsHeaders);
}

/**
 * Colonnes à lire pour sérialiser une fiche : toutes celles de `contacts` plus
 * le quartier **résolu** (nom + couleur), afin que le consommateur puisse
 * l'afficher sans second appel. À utiliser partout où le résultat part dans
 * `serializeContact` — un simple `select("*")` laisserait `quartier` à `null`.
 */
const CONTACT_SELECT = "*, quartier:quartiers(id, name, color)";

/** Rôles (triés par nom) et références externes d'un lot de contacts. */
async function loadRolesAndRefs(
  admin: AdminClient,
  contactIds: string[],
): Promise<{ rolesByContact: Map<string, Row[]>; refsByContact: Map<string, Row[]> }> {
  const rolesByContact = new Map<string, Row[]>();
  const refsByContact = new Map<string, Row[]>();
  if (contactIds.length === 0) return { rolesByContact, refsByContact };

  const [{ data: assignments, error: aErr }, { data: refs, error: rErr }] = await Promise.all([
    admin
      .from("contact_role_assignments")
      .select("contact_id, role:contact_roles(id, name)")
      .in("contact_id", contactIds),
    admin
      .from("contact_external_references")
      .select("id, contact_id, source, external_id, created_at, updated_at")
      .in("contact_id", contactIds)
      .order("source", { ascending: true }),
  ]);
  if (aErr) throw aErr;
  if (rErr) throw rErr;

  for (const row of (assignments ?? []) as Array<{ contact_id: string; role: Row | null }>) {
    if (!row.role) continue;
    const list = rolesByContact.get(row.contact_id) ?? [];
    list.push(row.role);
    rolesByContact.set(row.contact_id, list);
  }
  for (const list of rolesByContact.values()) {
    list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  for (const row of (refs ?? []) as Array<Row & { contact_id: string }>) {
    const list = refsByContact.get(row.contact_id) ?? [];
    list.push(row);
    refsByContact.set(row.contact_id, list);
  }
  return { rolesByContact, refsByContact };
}

/**
 * Relations d'un lot de contacts, dans les deux sens. Pour chaque contact :
 * `out` = il est <rôle> de `peer` ; `in` = `peer` est <rôle> de lui.
 */
async function loadRelations(
  admin: AdminClient,
  contactIds: string[],
): Promise<{ outByContact: Map<string, Row[]>; inByContact: Map<string, Row[]> }> {
  const outByContact = new Map<string, Row[]>();
  const inByContact = new Map<string, Row[]>();
  if (contactIds.length === 0) return { outByContact, inByContact };

  const [{ data: out, error: oErr }, { data: incoming, error: iErr }] = await Promise.all([
    admin
      .from("contact_relations")
      .select(
        "id, contact_id, role:contact_roles(id, name), peer:contacts!contact_relations_related_contact_id_fkey(id, display_name, contact_type)",
      )
      .in("contact_id", contactIds),
    admin
      .from("contact_relations")
      .select(
        "id, related_contact_id, role:contact_roles(id, name), peer:contacts!contact_relations_contact_id_fkey(id, display_name, contact_type)",
      )
      .in("related_contact_id", contactIds),
  ]);
  if (oErr) throw oErr;
  if (iErr) throw iErr;

  for (const row of (out ?? []) as Array<Row & { contact_id: string }>) {
    const list = outByContact.get(row.contact_id) ?? [];
    list.push(row);
    outByContact.set(row.contact_id, list);
  }
  for (const row of (incoming ?? []) as Array<Row & { related_contact_id: string }>) {
    const list = inByContact.get(row.related_contact_id) ?? [];
    list.push(row);
    inByContact.set(row.related_contact_id, list);
  }
  const byPeerName = (a: Row, b: Row) =>
    String((a.peer as Row | null)?.display_name ?? "").localeCompare(
      String((b.peer as Row | null)?.display_name ?? ""),
    );
  for (const list of outByContact.values()) list.sort(byPeerName);
  for (const list of inByContact.values()) list.sort(byPeerName);
  return { outByContact, inByContact };
}

/**
 * Historique des consentements d'UNE fiche, du plus récent au plus ancien.
 *
 * Volontairement absent des réponses de LISTE et de rapprochement : l'état
 * courant (`consent_*`, colonnes de la fiche) y suffit, et joindre la preuve
 * de 200 usagers pour afficher un annuaire serait du poids pur. `consents`
 * vaut donc `[]` ailleurs qu'ici — comme `quartier` vaut `null` quand la
 * jointure n'a pas été demandée.
 */
const CONSENT_HISTORY_LIMIT = 50;

async function loadConsents(admin: AdminClient, contactId: string): Promise<Row[]> {
  const { data, error } = await admin
    .from("contact_consents")
    .select("id, kind, granted, statement, source_app, source_reference, collected_at, created_at")
    .eq("contact_id", contactId)
    .order("collected_at", { ascending: false })
    .limit(CONSENT_HISTORY_LIMIT);
  if (error) throw error;
  return (data ?? []) as Row[];
}

/** Fiche complète sérialisée (contact + rôles + références + relations + consentements), ou null si absente. */
async function fetchContactDto(admin: AdminClient, orgId: string, id: string) {
  const { data, error } = await admin
    .from("contacts")
    .select(CONTACT_SELECT)
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [{ rolesByContact, refsByContact }, { outByContact, inByContact }, consents] = await Promise.all([
    loadRolesAndRefs(admin, [id]),
    loadRelations(admin, [id]),
    loadConsents(admin, id),
  ]);
  return serializeContact(
    data,
    rolesByContact.get(id) ?? [],
    refsByContact.get(id) ?? [],
    outByContact.get(id) ?? [],
    inByContact.get(id) ?? [],
    consents,
  );
}

/**
 * Géocode une adresse via la BAN (Géoplateforme IGN). **Best-effort** : toute
 * erreur (réseau, quota, réponse malformée, score trop faible) renvoie `null`
 * — l'écriture de la fiche n'échoue jamais à cause du géocodage.
 */
async function geocodeAddress(query: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const params = new URLSearchParams({ q: query, limit: "1" });
    const res = await fetch(`${BAN_SEARCH_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return parseBanResult(await res.json());
  } catch (_) {
    return null;
  }
}

/**
 * Adresse géocodable sur l'état fusionné (fiche courante + patch) — à la
 * création, passer `{}` comme fiche courante.
 */
function mergedAddress(current: Row, patch: Record<string, unknown>): GeocodableAddress {
  const pick = (key: string): string | null => {
    const value = key in patch ? patch[key] : current[key];
    return typeof value === "string" ? value : null;
  };
  return {
    address_line1: pick("address_line1"),
    postal_code: pick("postal_code"),
    city: pick("city"),
    country: pick("country"),
  };
}

/** Vérifie que le quartier existe dans l'organisation (catalogue /v1/quartiers). */
async function checkQuartierId(admin: AdminClient, orgId: string, quartierId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("quartiers")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", quartierId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** Vérifie que tous les rôles existent dans le catalogue de l'organisation. */
async function checkRoleIds(admin: AdminClient, orgId: string, roleIds: string[]): Promise<boolean> {
  if (roleIds.length === 0) return true;
  const { data, error } = await admin
    .from("contact_roles")
    .select("id")
    .eq("organization_id", orgId)
    .in("id", roleIds);
  if (error) throw error;
  return (data ?? []).length === roleIds.length;
}

/** Remplace l'ensemble des rôles du contact (par différence, pas delete-all). */
async function replaceRoles(admin: AdminClient, contactId: string, roleIds: string[]): Promise<void> {
  const { data: current, error } = await admin
    .from("contact_role_assignments")
    .select("id, role_id")
    .eq("contact_id", contactId);
  if (error) throw error;
  const currentByRole = new Map((current ?? []).map((r: Row) => [String(r.role_id), String(r.id)]));
  const wanted = new Set(roleIds);

  const toDelete = [...currentByRole.entries()]
    .filter(([roleId]) => !wanted.has(roleId))
    .map(([, id]) => id);
  const toInsert = roleIds
    .filter((roleId) => !currentByRole.has(roleId))
    .map((roleId) => ({ contact_id: contactId, role_id: roleId }));

  if (toDelete.length > 0) {
    const { error: dErr } = await admin.from("contact_role_assignments").delete().in("id", toDelete);
    if (dErr) throw dErr;
  }
  if (toInsert.length > 0) {
    const { error: iErr } = await admin.from("contact_role_assignments").insert(toInsert);
    if (iErr) throw iErr;
  }
}

/**
 * Vérifie les relations : les contacts cibles existent dans l'organisation,
 * sont des structures (jamais une personne physique — aucun lien entre deux
 * personnes) et les rôles viennent du catalogue. `selfId` interdit la relation
 * vers soi-même.
 */
async function checkRelations(
  admin: AdminClient,
  orgId: string,
  relations: RelationInput[],
  selfId: string | null,
): Promise<string | null> {
  if (relations.length === 0) return null;
  if (selfId && relations.some((r) => r.related_contact_id === selfId)) {
    return "Un contact ne peut pas avoir de relation avec lui-même.";
  }
  const relatedIds = [...new Set(relations.map((r) => r.related_contact_id))];
  const roleIds = [...new Set(relations.map((r) => r.role_id))];
  const [{ data: contacts, error: cErr }, rolesOk] = await Promise.all([
    admin.from("contacts").select("id, contact_type").eq("organization_id", orgId).in("id", relatedIds),
    checkRoleIds(admin, orgId, roleIds),
  ]);
  if (cErr) throw cErr;
  if ((contacts ?? []).length !== relatedIds.length) {
    return "relations contient des contacts inconnus pour cette organisation.";
  }
  if ((contacts ?? []).some((c: Row) => c.contact_type === "personne")) {
    return "Une relation ne peut pas cibler une personne physique (cible : entreprise, association ou administration).";
  }
  if (!rolesOk) {
    return "relations contient des rôles inconnus pour cette organisation (voir /v1/contact-roles).";
  }
  return null;
}

/** Remplace l'ensemble des relations sortantes du contact (par différence). */
async function replaceRelations(
  admin: AdminClient,
  contactId: string,
  relations: RelationInput[],
): Promise<void> {
  const { data: current, error } = await admin
    .from("contact_relations")
    .select("id, related_contact_id, role_id")
    .eq("contact_id", contactId);
  if (error) throw error;
  const keyOf = (relatedId: string, roleId: string) => `${relatedId}:${roleId}`;
  const currentByKey = new Map(
    (current ?? []).map((r: Row) => [keyOf(String(r.related_contact_id), String(r.role_id)), String(r.id)]),
  );
  const wanted = new Set(relations.map((r) => keyOf(r.related_contact_id, r.role_id)));

  const toDelete = [...currentByKey.entries()]
    .filter(([key]) => !wanted.has(key))
    .map(([, id]) => id);
  const toInsert = relations
    .filter((r) => !currentByKey.has(keyOf(r.related_contact_id, r.role_id)))
    .map((r) => ({ contact_id: contactId, related_contact_id: r.related_contact_id, role_id: r.role_id }));

  if (toDelete.length > 0) {
    const { error: dErr } = await admin.from("contact_relations").delete().in("id", toDelete);
    if (dErr) throw dErr;
  }
  if (toInsert.length > 0) {
    const { error: iErr } = await admin.from("contact_relations").insert(toInsert);
    if (iErr) throw iErr;
  }
}

/** Remplace l'ensemble des références externes (upsert par source, puis purge). */
async function replaceExternalRefs(
  admin: AdminClient,
  contactId: string,
  refs: ExternalRefInput[],
): Promise<void> {
  const { data: current, error } = await admin
    .from("contact_external_references")
    .select("id, source")
    .eq("contact_id", contactId);
  if (error) throw error;
  const wantedSources = new Set(refs.map((r) => r.source));
  const toDelete = (current ?? [])
    .filter((r: Row) => !wantedSources.has(String(r.source)))
    .map((r: Row) => String(r.id));

  if (toDelete.length > 0) {
    const { error: dErr } = await admin.from("contact_external_references").delete().in("id", toDelete);
    if (dErr) throw dErr;
  }
  if (refs.length > 0) {
    const { error: uErr } = await admin
      .from("contact_external_references")
      .upsert(
        refs.map((r) => ({ contact_id: contactId, source: r.source, external_id: r.external_id })),
        { onConflict: "contact_id,source" },
      );
    if (uErr) throw uErr;
  }
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
        name: "API Socle — Référentiel des usagers",
        description:
          "Consultation, création, modification et archivage des usagers. Pas de suppression.",
        openapi: `${serverUrl}/openapi.json`,
      },
      corsHeaders,
    );
  }
  if (path === "/openapi.json") {
    return jsonResponse(200, buildOpenApiDocument(serverUrl), corsHeaders);
  }

  if (!["GET", "POST", "PATCH"].includes(req.method)) {
    return errorResponse(
      "method_not_allowed",
      "Méthode non autorisée (la suppression n'est pas disponible via cette API).",
      corsHeaders,
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // --- Authentification par clé API + scope `contacts` ---
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
      requiredScope: "contacts",
      scopeMessage: "Cette clé ne porte pas le scope « contacts » requis pour le référentiel des usagers.",
    });
    if (!decision.ok) return errorResponse(decision.code, decision.message, corsHeaders);
    const apiKey = decision.key;

    // Périmètre : une clé LIÉE borne à son organisation (racine). Une clé
    // PLATEFORME (organization_id NULL) sert le référentiel de la RACINE de
    // l'organisation visée, portée par l'en-tête X-Organization-Id — à
    // condition que cette racine soit ABONNÉE à l'application de la clé
    // (`application_scope_ids`). Hors abonnement = introuvable, comme hors
    // référentiel : on ne renseigne pas sur les clients des autres.
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
      const { data: scopeRows, error: scopeError } = await admin.rpc("application_scope_ids", {
        p_application: apiKey.consumer,
      });
      if (scopeError) {
        return errorResponse("internal_error", "Impossible de calculer le périmètre.", corsHeaders);
      }
      if (!(Array.isArray(scopeRows) && scopeRows.includes(rootId))) {
        return errorResponse("not_found", "Organisation introuvable.", corsHeaders);
      }
      orgId = rootId;
    }

    // Trace best-effort (n'interrompt pas la requête en cas d'échec).
    try {
      await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", apiKey.id);
    } catch (_) {
      // ignoré
    }

    const url = new URL(req.url);
    const segments = path.split("/").filter(Boolean); // ex. ["v1","contacts","<id>","archive"]
    if (segments[0] !== "v1") {
      return errorResponse("not_found", "Endpoint inconnu.", corsHeaders);
    }

    // --- /v1/contact-roles ---
    if (segments[1] === "contact-roles" && segments.length === 2) {
      if (req.method !== "GET") {
        return errorResponse("method_not_allowed", "Seule la méthode GET est autorisée ici.", corsHeaders);
      }
      const { data, error } = await admin
        .from("contact_roles")
        .select("*")
        .eq("organization_id", orgId)
        .order("name", { ascending: true });
      if (error) throw error;
      return jsonResponse(200, (data ?? []).map(serializeContactRole), corsHeaders);
    }

    if (segments[1] !== "contacts") {
      return errorResponse("not_found", "Endpoint inconnu.", corsHeaders);
    }

    // --- GET /v1/contacts (liste) + POST /v1/contacts (création) ---
    if (segments.length === 2) {
      if (req.method === "GET") {
        const type = url.searchParams.get("type");
        if (type !== null && !(CONTACT_TYPES as readonly string[]).includes(type)) {
          return errorResponse("bad_request", "Paramètre type invalide.", corsHeaders);
        }
        const status = url.searchParams.get("status");
        if (status !== null && status !== "active" && status !== "archived") {
          return errorResponse("bad_request", "Paramètre status invalide (active | archived).", corsHeaders);
        }
        const quartierId = url.searchParams.get("quartier_id");
        if (quartierId !== null && quartierId !== "null" && !isUuid(quartierId)) {
          return errorResponse(
            "bad_request",
            "Paramètre quartier_id invalide (UUID de quartier, ou null pour les usagers sans quartier).",
            corsHeaders,
          );
        }
        const pagination = parsePagination(url.searchParams.get("limit"), url.searchParams.get("offset"));
        if (!pagination.ok) {
          return errorResponse("bad_request", pagination.message, corsHeaders);
        }

        // Recherche par référence externe (source + external_id ensemble).
        const source = url.searchParams.get("source");
        const externalId = url.searchParams.get("external_id");
        if ((source === null) !== (externalId === null)) {
          return errorResponse("bad_request", "source et external_id vont ensemble.", corsHeaders);
        }
        let idFilter: string[] | null = null;
        if (source !== null && externalId !== null) {
          const { data: refRows, error: refErr } = await admin
            .from("contact_external_references")
            .select("contact_id")
            .eq("organization_id", orgId)
            .eq("source", source)
            .eq("external_id", externalId);
          if (refErr) throw refErr;
          idFilter = (refRows ?? []).map((r: Row) => String(r.contact_id));
          if (idFilter.length === 0) return jsonResponse(200, [], corsHeaders);
        }

        let query = admin.from("contacts").select(CONTACT_SELECT).eq("organization_id", orgId);
        if (type !== null) query = query.eq("contact_type", type);
        if (status !== null) query = query.eq("status", status);
        if (quartierId === "null") query = query.is("quartier_id", null);
        else if (quartierId !== null) query = query.eq("quartier_id", quartierId);
        const search = url.searchParams.get("search");
        if (search !== null && search.trim() !== "") {
          query = query.ilike("display_name", `%${escapeIlikePattern(search.trim())}%`);
        }
        // Filtre email : égalité exacte insensible à la casse (pas de recherche partielle,
        // pour un rapprochement fiable — ex. auto-match de l'expéditeur d'un mail entrant).
        const email = url.searchParams.get("email");
        if (email !== null && email.trim() !== "") {
          query = query.ilike("email", escapeIlikePattern(email.trim()));
        }
        // Filtre téléphone : égalité sur les chiffres significatifs (indicatif
        // France et 0 initial retirés — colonnes générées normalisées), le
        // numéro cherché est comparé au mobile ET au fixe.
        const phone = url.searchParams.get("phone");
        if (phone !== null && phone.trim() !== "") {
          const normalizedPhone = normalizePhoneNumber(phone);
          if (normalizedPhone === null) {
            return errorResponse("bad_request", "Paramètre phone invalide (aucun chiffre).", corsHeaders);
          }
          // Chiffres seuls après normalisation → sûr dans la syntaxe .or().
          query = query.or(
            `mobile_phone_normalized.eq.${normalizedPhone},landline_phone_normalized.eq.${normalizedPhone}`,
          );
        }
        if (idFilter !== null) query = query.in("id", idFilter);
        const { data, error } = await query
          .order("display_name", { ascending: true })
          .range(pagination.offset, pagination.offset + pagination.limit - 1);
        if (error) throw error;

        const rows = (data ?? []) as Row[];
        const ids = rows.map((r) => String(r.id));
        const [{ rolesByContact, refsByContact }, { outByContact, inByContact }] = await Promise.all([
          loadRolesAndRefs(admin, ids),
          loadRelations(admin, ids),
        ]);
        return jsonResponse(
          200,
          rows.map((row) =>
            serializeContact(
              row,
              rolesByContact.get(String(row.id)) ?? [],
              refsByContact.get(String(row.id)) ?? [],
              outByContact.get(String(row.id)) ?? [],
              inByContact.get(String(row.id)) ?? [],
            ),
          ),
          corsHeaders,
        );
      }

      // POST — création
      let body: unknown;
      try {
        body = await req.json();
      } catch (_) {
        return errorResponse("bad_request", "Corps JSON invalide.", corsHeaders);
      }
      const parsed = parseContactPayload(body, "create");
      if (!parsed.ok) return errorResponse("bad_request", parsed.message, corsHeaders);
      const { fields, roleIds, externalRefs, relations } = parsed.value;

      const invariant = contactInvariantError(mergeContactShape({}, fields));
      if (invariant) return errorResponse("bad_request", invariant, corsHeaders);

      // Coordonnées fournies → cohérence de la paire ; sinon géocodage BAN
      // best-effort de l'adresse (le trigger DB rattache ensuite le quartier).
      if ("address_lat" in fields || "address_lon" in fields) {
        const pairErr = coordinatesPairError(fields.address_lat ?? null, fields.address_lon ?? null);
        if (pairErr) return errorResponse("bad_request", pairErr, corsHeaders);
      } else {
        const geocodeQuery = buildGeocodeQuery(mergedAddress({}, fields));
        if (geocodeQuery) {
          const position = await geocodeAddress(geocodeQuery);
          if (position) {
            fields.address_lat = position.lat;
            fields.address_lon = position.lon;
          }
        }
      }
      if (typeof fields.quartier_id === "string" && !(await checkQuartierId(admin, orgId, fields.quartier_id))) {
        return errorResponse(
          "bad_request",
          "quartier_id inconnu pour cette organisation (voir /v1/quartiers de l'API référentiel).",
          corsHeaders,
        );
      }

      if (roleIds && !(await checkRoleIds(admin, orgId, roleIds))) {
        return errorResponse(
          "bad_request",
          "role_ids contient des rôles inconnus pour cette organisation (voir /v1/contact-roles).",
          corsHeaders,
        );
      }
      if (relations) {
        const relErr = await checkRelations(admin, orgId, relations, null);
        if (relErr) return errorResponse("bad_request", relErr, corsHeaders);
      }

      const { data: created, error: insErr } = await admin
        .from("contacts")
        .insert({ ...fields, organization_id: orgId })
        .select("id")
        .single();
      if (insErr) return writeErrorResponse(insErr);
      const createdId = String((created as Row).id);

      try {
        if (roleIds && roleIds.length > 0) await replaceRoles(admin, createdId, roleIds);
        if (externalRefs && externalRefs.length > 0) {
          await replaceExternalRefs(admin, createdId, externalRefs);
        }
        if (relations && relations.length > 0) await replaceRelations(admin, createdId, relations);
      } catch (err) {
        // Compensation : on ne laisse pas une fiche à moitié créée.
        await admin.from("contacts").delete().eq("id", createdId);
        return writeErrorResponse(err);
      }

      const dto = await fetchContactDto(admin, orgId, createdId);
      return jsonResponse(201, dto, corsHeaders);
    }

    // --- POST /v1/contacts/match : rapprochement d'identités ---------------
    // **Lecture seule** malgré le POST (le corps porte une identité partielle,
    // trop riche pour une query string) : aucune fiche n'est créée ni modifiée.
    // Le rapprochement lui-même vit dans la RPC `match_contacts` (pg_trgm +
    // unaccent, EXECUTE réservé à service_role), bornée à l'org de la clé.
    if (segments.length === 3 && segments[2] === "match") {
      if (req.method !== "POST") {
        return errorResponse("method_not_allowed", "Seule la méthode POST est autorisée ici.", corsHeaders);
      }
      let body: unknown;
      try {
        body = await req.json();
      } catch (_) {
        return errorResponse("bad_request", "Corps JSON invalide.", corsHeaders);
      }
      const parsed = parseMatchPayload(body);
      if (!parsed.ok) return errorResponse("bad_request", parsed.message, corsHeaders);
      const input = parsed.value;

      const { data: matches, error: matchErr } = await admin.rpc("match_contacts", {
        p_org_id: orgId,
        p_contact_type: input.contact_type,
        p_first_name: input.first_name,
        p_last_name: input.last_name,
        p_usage_name: input.usage_name,
        p_legal_name: input.legal_name,
        p_siret: input.siret,
        p_birth_date: input.birth_date,
        p_email: input.email,
        p_phones: input.phones,
        p_status: input.status,
        p_exclude_ids: input.exclude_ids,
        p_limit: input.limit,
      });
      if (matchErr) throw matchErr;
      const candidates = (matches ?? []) as Array<{
        contact_id: string;
        score: number;
        reasons: string[];
      }>;
      if (candidates.length === 0) return jsonResponse(200, [], corsHeaders);

      const ids = candidates.map((c) => c.contact_id);
      const { data: contactRows, error: rowsErr } = await admin
        .from("contacts")
        .select(CONTACT_SELECT)
        .eq("organization_id", orgId)
        .in("id", ids);
      if (rowsErr) throw rowsErr;
      const rowById = new Map(((contactRows ?? []) as Row[]).map((r) => [String(r.id), r]));
      const [{ rolesByContact, refsByContact }, { outByContact, inByContact }] = await Promise.all([
        loadRolesAndRefs(admin, ids),
        loadRelations(admin, ids),
      ]);
      return jsonResponse(
        200,
        candidates.flatMap((candidate) => {
          const row = rowById.get(candidate.contact_id);
          if (!row) return [];
          return [
            {
              contact: serializeContact(
                row,
                rolesByContact.get(candidate.contact_id) ?? [],
                refsByContact.get(candidate.contact_id) ?? [],
                outByContact.get(candidate.contact_id) ?? [],
                inByContact.get(candidate.contact_id) ?? [],
              ),
              score: candidate.score,
              reasons: candidate.reasons,
            },
          ];
        }),
        corsHeaders,
      );
    }

    // --- Endpoints sur une fiche : /v1/contacts/{id}[...] ---
    const id = segments[2];
    if (!isUuid(id)) {
      return errorResponse("bad_request", "Identifiant d'usager invalide.", corsHeaders);
    }

    // GET / PATCH /v1/contacts/{id}
    if (segments.length === 3) {
      if (req.method === "GET") {
        const dto = await fetchContactDto(admin, orgId, id);
        if (!dto) return errorResponse("not_found", "Usager introuvable.", corsHeaders);
        return jsonResponse(200, dto, corsHeaders);
      }
      if (req.method !== "PATCH") {
        return errorResponse("method_not_allowed", "Méthodes autorisées : GET, PATCH.", corsHeaders);
      }

      const { data: current, error: curErr } = await admin
        .from("contacts")
        .select("*")
        .eq("id", id)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (curErr) throw curErr;
      if (!current) return errorResponse("not_found", "Usager introuvable.", corsHeaders);

      let body: unknown;
      try {
        body = await req.json();
      } catch (_) {
        return errorResponse("bad_request", "Corps JSON invalide.", corsHeaders);
      }
      const parsed = parseContactPayload(body, "update");
      if (!parsed.ok) return errorResponse("bad_request", parsed.message, corsHeaders);
      const { fields, roleIds, externalRefs, relations } = parsed.value;

      const invariant = contactInvariantError(mergeContactShape(current as Row, fields));
      if (invariant) return errorResponse("bad_request", invariant, corsHeaders);

      // Coordonnées fournies → cohérence de la paire sur l'état fusionné ;
      // sinon, adresse modifiée → re-géocodage BAN. En cas d'échec, les
      // coordonnées sont remises à null : des coordonnées périmées
      // rattacheraient l'usager au quartier de son ancienne adresse.
      if ("address_lat" in fields || "address_lon" in fields) {
        const mergedLat = "address_lat" in fields ? fields.address_lat : (current as Row).address_lat;
        const mergedLon = "address_lon" in fields ? fields.address_lon : (current as Row).address_lon;
        const pairErr = coordinatesPairError(mergedLat ?? null, mergedLon ?? null);
        if (pairErr) return errorResponse("bad_request", pairErr, corsHeaders);
      } else if (addressTouched(fields)) {
        const geocodeQuery = buildGeocodeQuery(mergedAddress(current as Row, fields));
        const position = geocodeQuery ? await geocodeAddress(geocodeQuery) : null;
        fields.address_lat = position?.lat ?? null;
        fields.address_lon = position?.lon ?? null;
      }
      if (typeof fields.quartier_id === "string" && !(await checkQuartierId(admin, orgId, fields.quartier_id))) {
        return errorResponse(
          "bad_request",
          "quartier_id inconnu pour cette organisation (voir /v1/quartiers de l'API référentiel).",
          corsHeaders,
        );
      }

      if (roleIds && !(await checkRoleIds(admin, orgId, roleIds))) {
        return errorResponse(
          "bad_request",
          "role_ids contient des rôles inconnus pour cette organisation (voir /v1/contact-roles).",
          corsHeaders,
        );
      }
      if (relations) {
        const relErr = await checkRelations(admin, orgId, relations, id);
        if (relErr) return errorResponse("bad_request", relErr, corsHeaders);
      }

      if (Object.keys(fields).length > 0) {
        const { error: updErr } = await admin.from("contacts").update(fields).eq("id", id);
        if (updErr) return writeErrorResponse(updErr);
      }
      try {
        if (roleIds !== undefined) await replaceRoles(admin, id, roleIds);
        if (externalRefs !== undefined) await replaceExternalRefs(admin, id, externalRefs);
        if (relations !== undefined) await replaceRelations(admin, id, relations);
      } catch (err) {
        return writeErrorResponse(err);
      }

      const dto = await fetchContactDto(admin, orgId, id);
      return jsonResponse(200, dto, corsHeaders);
    }

    // POST /v1/contacts/{id}/consents — consigner un recueil de consentement.
    //
    // Sous-ressource dédiée, et non des champs du PATCH de la fiche : un
    // consentement n'est pas une propriété qu'on écrase, c'est un ÉVÉNEMENT
    // daté. L'état courant de la fiche en est dérivé par trigger — l'API n'y
    // touche jamais, sans quoi il y aurait deux sources pour un même fait.
    //
    // Idempotent : rejouer le même dépôt (même `source_app` + `source_reference`)
    // met à jour la ligne au lieu d'en créer une seconde. Une edge function qui
    // réessaie après un échec réseau ne double donc pas l'historique.
    if (segments.length === 4 && segments[3] === "consents") {
      if (req.method !== "POST") {
        return errorResponse("method_not_allowed", "Seule la méthode POST est autorisée ici.", corsHeaders);
      }
      const { data: target, error: targetErr } = await admin
        .from("contacts")
        .select("id")
        .eq("id", id)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (targetErr) throw targetErr;
      if (!target) return errorResponse("not_found", "Usager introuvable.", corsHeaders);

      let body: unknown;
      try {
        body = await req.json();
      } catch (_) {
        return errorResponse("bad_request", "Corps JSON invalide.", corsHeaders);
      }
      const parsed = parseConsentsPayload(body);
      if (!parsed.ok) return errorResponse("bad_request", parsed.message, corsHeaders);

      const rows = parsed.value.map((c) => ({ ...c, contact_id: id }));
      // `organization_id` est posée par trigger depuis le contact : l'omettre
      // ici est délibéré — une organisation venue de l'appelant pourrait
      // désigner une autre racine que celle du contact.
      //
      // UN SEUL upsert pour les deux cas. L'index d'idempotence n'est pas
      // partiel (correctif `20260913100100`, sans quoi `ON CONFLICT` ne saurait
      // pas l'inférer) et les NULL y sont DISTINCTS : un recueil sans
      // `source_reference` n'entre en conflit avec rien et s'insère — un fait
      // nouveau à chaque appel —, tandis qu'un recueil avec référence reste
      // unique par dépôt et se met à jour au rejeu.
      const { error: upErr } = await admin
        .from("contact_consents")
        .upsert(rows, { onConflict: "contact_id,kind,source_app,source_reference" });
      if (upErr) return writeErrorResponse(upErr);

      const dto = await fetchContactDto(admin, orgId, id);
      return jsonResponse(201, dto, corsHeaders);
    }

    // POST /v1/contacts/{id}/archive | /restore
    if (segments.length === 4 && (segments[3] === "archive" || segments[3] === "restore")) {
      if (req.method !== "POST") {
        return errorResponse("method_not_allowed", "Seule la méthode POST est autorisée ici.", corsHeaders);
      }
      const status = segments[3] === "archive" ? "archived" : "active";
      const { data: updated, error: updErr } = await admin
        .from("contacts")
        .update({ status })
        .eq("id", id)
        .eq("organization_id", orgId)
        .select("id")
        .maybeSingle();
      if (updErr) return writeErrorResponse(updErr);
      if (!updated) return errorResponse("not_found", "Usager introuvable.", corsHeaders);
      const dto = await fetchContactDto(admin, orgId, id);
      return jsonResponse(200, dto, corsHeaders);
    }

    return errorResponse("not_found", "Endpoint inconnu.", corsHeaders);
  } catch (err) {
    console.error("contacts-api error:", err);
    return errorResponse("internal_error", "Erreur interne du serveur.", corsHeaders);
  }
});
