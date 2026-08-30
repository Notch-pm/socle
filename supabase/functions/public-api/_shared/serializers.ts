/**
 * Sérialiseurs : ligne DB (brute, éventuellement issue d'un `select *`) → DTO
 * public. **Whitelist stricte** : chaque champ exposé est recopié explicitement,
 * donc aucune colonne sensible (SMTP, mots de passe, hash de clé…) ne peut fuir,
 * même si la requête ramène des colonnes en trop. Logique pure et testée.
 */
import type {
  CategoryDto,
  DocumentTypeDto,
  OrganizationDto,
  OrganizationProcedureDto,
  ProcedureDto,
  QuartierDto,
  SmtpSettingsDto,
} from "./dto.ts";

/** Ligne DB brute, structure inconnue à la compilation. */
type Row = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function nullableStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableNum(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

export function serializeOrganization(row: Row): OrganizationDto {
  return {
    id: str(row.id),
    parent_id: nullableStr(row.parent_id),
    name: str(row.name),
    slug: nullableStr(row.slug),
    type: nullableStr(row.type),
    status: str(row.status),
    address: nullableStr(row.address),
    phone: nullableStr(row.phone),
    email: nullableStr(row.email),
    logo_url: nullableStr(row.logo_url),
    email_sender_override: Boolean(row.email_sender_override),
    email_sender_name: nullableStr(row.email_sender_name),
    metadata: row.metadata ?? null,
    created_at: nullableStr(row.created_at),
  };
}

export function serializeCategory(row: Row): CategoryDto {
  return {
    id: str(row.id),
    organization_id: nullableStr(row.organization_id),
    name: str(row.name),
    icon: nullableStr(row.icon),
    created_at: nullableStr(row.created_at),
  };
}

export function serializeProcedure(row: Row): ProcedureDto {
  return {
    id: str(row.id),
    organization_id: nullableStr(row.organization_id),
    category_id: nullableStr(row.category_id),
    name: str(row.name),
    type: str(row.type),
    // Colonne `text` + CHECK en base ; au moindre doute on sert « brouillon »,
    // le statut qui ne fait rien publier.
    status: row.status === "production" ? "production" : "brouillon",
    keywords: Array.isArray(row.keywords) ? (row.keywords as string[]) : [],
    short_description: nullableStr(row.short_description),
    user_description: nullableStr(row.user_description),
    agent_description: nullableStr(row.agent_description),
    input_duration_minutes: nullableNum(row.input_duration_minutes),
    order_index: nullableNum(row.order_index),
    requester_config: row.requester_config ?? null,
    form_schema: row.form_schema ?? null,
    knowledge_base: row.knowledge_base ?? null,
    communication_config: row.communication_config ?? null,
    translations: row.translations ?? null,
    created_at: nullableStr(row.created_at),
    updated_at: nullableStr(row.updated_at),
  };
}

export function serializeOrganizationProcedure(row: Row): OrganizationProcedureDto {
  return {
    organization_id: nullableStr(row.organization_id),
    procedure_id: nullableStr(row.procedure_id),
    is_enabled: Boolean(row.is_enabled),
    custom_name: nullableStr(row.custom_name),
    custom_order: nullableNum(row.custom_order),
    metadata: row.metadata ?? null,
  };
}

/**
 * La colonne `geom` (binaire PostGIS) n'est **jamais** exposée telle quelle :
 * la géométrie n'est incluse que si elle est fournie explicitement (GeoJSON de
 * la RPC `list_quartiers_geojson`), quand le consommateur la demande.
 */
export function serializeQuartier(row: Row, geometry?: unknown): QuartierDto {
  const dto: QuartierDto = {
    id: str(row.id),
    organization_id: str(row.organization_id),
    name: str(row.name),
    color: nullableStr(row.color),
    created_at: nullableStr(row.created_at),
    updated_at: nullableStr(row.updated_at),
  };
  if (geometry !== undefined) dto.geometry = geometry;
  return dto;
}

export function serializeDocumentType(row: Row): DocumentTypeDto {
  return {
    id: str(row.id),
    organization_id: str(row.organization_id),
    name: str(row.name),
    created_at: nullableStr(row.created_at),
  };
}

/** Chaîne non vide après élagage, `null` sinon (les colonnes SMTP sont `not null default ''`). */
function nonEmpty(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Serveur d'envoi applicable à une organisation — whitelist stricte, **mot de
 * passe compris** : c'est la seule sortie sensible de l'API, et elle n'est
 * atteignable qu'avec le scope `smtp` (voir `index.ts` et `dto.ts`).
 *
 * `organizationId` est l'organisation **demandée** ; `row` la ligne **résolue**
 * (la sienne, ou celle de l'ancêtre dont elle hérite) → `source_organization_id`
 * dit laquelle des deux porte le relais.
 *
 * Une ligne dont l'hôte ou l'adresse d'expédition manque est traitée comme
 * **absente** (`configured: false`) : les colonnes Socle valent `''` par
 * défaut, une configuration à moitié saisie ne doit pas se transmettre en aval
 * comme un relais utilisable. Le mot de passe n'est jamais élagué (une espace
 * peut en faire partie) — seulement testé non vide.
 */
export function serializeSmtpSettings(organizationId: string, row: Row | null): SmtpSettingsDto {
  const host = nonEmpty(row?.host);
  const fromEmail = nonEmpty(row?.from_email);
  if (!row || host === null || fromEmail === null) {
    return {
      organization_id: organizationId,
      source_organization_id: null,
      configured: false,
      host: null,
      port: null,
      username: null,
      password: null,
      from_email: null,
      from_name: null,
      use_tls: null,
      updated_at: null,
    };
  }
  const port = nullableNum(row.port);
  return {
    organization_id: organizationId,
    source_organization_id: nullableStr(row.organization_id) ?? organizationId,
    configured: true,
    host,
    port: port !== null && Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 587,
    username: nonEmpty(row.username),
    password: typeof row.password === "string" && row.password !== "" ? row.password : null,
    from_email: fromEmail.toLowerCase(),
    from_name: nonEmpty(row.from_name),
    use_tls: row.use_tls !== false,
    updated_at: nullableStr(row.updated_at),
  };
}
