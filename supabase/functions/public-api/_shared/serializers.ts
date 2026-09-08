/**
 * Sérialiseurs : ligne DB (brute, éventuellement issue d'un `select *`) → DTO
 * public. **Whitelist stricte** : chaque champ exposé est recopié explicitement,
 * donc aucune colonne sensible (SMTP, mots de passe, hash de clé…) ne peut fuir,
 * même si la requête ramène des colonnes en trop. Logique pure et testée.
 */
import type {
  BrandingDto,
  CategoryDto,
  DocumentTemplateDto,
  DocumentTypeDto,
  ProcedureDocumentDto,
  ProcedureDocumentsDto,
  OrganizationDto,
  PortalProcedureDetailDto,
  PortalProcedureDto,
  OrganizationProcedureDto,
  ProcedureDto,
  QuartierDto,
  SmtpSettingsDto,
  TenantDto,
} from "./dto.ts";
import { serializePortalTheme } from "./portalTheme.ts";

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
    is_internal_service: Boolean(row.is_internal_service),
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
    // Schéma possédé, transmis tel quel (comme `form_schema` ou `translations`
    // sur une démarche) : la forme est décrite dans l'OpenAPI.
    translations: row.translations ?? null,
    created_at: nullableStr(row.created_at),
  };
}

export function serializeDocumentTemplate(row: Row): DocumentTemplateDto {
  return {
    id: str(row.id),
    organization_id: str(row.organization_id),
    name: str(row.name),
    description: nullableStr(row.description),
    type: str(row.type),
    file_name: str(row.file_name),
    created_at: nullableStr(row.created_at),
    updated_at: nullableStr(row.updated_at),
  };
}

/** Conditions de visibilité reconnues (miroir de `DOCUMENT_VISIBILITIES`). */
const VISIBILITIES = new Set(["toujours", "positive", "negative"]);

/**
 * Lit une liste de documents du bloc `communication_config.documents`.
 *
 * ⚠️ **Miroir volontaire** de `parseDocumentList` dans
 * `src/features/procedures/communication.ts` : le code d'une edge function est
 * déployé séparément et ne peut rien importer de `src/`. Les deux doivent rester
 * d'accord — mêmes règles (identifiant non vide, dédoublonnage, condition
 * inconnue ramenée à `toujours`), et les tests des deux côtés les épinglent.
 */
function readDocumentIds(raw: unknown): Array<{ id: string; visibility: string }> {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Array<{ id: string; visibility: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { id, visibility } = item as Record<string, unknown>;
    const key = typeof id === "string" ? id.trim() : "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: key,
      visibility: VISIBILITIES.has(visibility as string) ? (visibility as string) : "toujours",
    });
  }
  return out;
}

/**
 * Résout le bloc « Documents et courriers » d'une démarche contre le catalogue.
 *
 * ⚠️ Une référence dont le document a été **supprimé du catalogue** est écartée :
 * le JSON ne porte pas de clé étrangère, une sélection peut donc survivre à son
 * document. Servir un identifiant mort obligerait chaque consommateur à gérer un
 * 404 sur `signed-url`.
 */
export function serializeProcedureDocuments(
  communicationConfig: unknown,
  templatesById: Map<string, Row>,
): ProcedureDocumentsDto {
  const empty: ProcedureDocumentsDto = { restrict_visibility: false, items: [] };
  if (!communicationConfig || typeof communicationConfig !== "object") return empty;

  const block = (communicationConfig as Record<string, unknown>).documents;
  if (!block || typeof block !== "object") return empty;

  const documents = block as Record<string, unknown>;
  const items: ProcedureDocumentDto[] = [];
  // Documents d'abord, courriers ensuite — l'ordre de l'écran de paramétrage.
  for (const [key, group] of [
    ["documents", "document"],
    ["letters", "courrier"],
  ] as const) {
    for (const entry of readDocumentIds(documents[key])) {
      const template = templatesById.get(entry.id);
      if (!template) continue;
      items.push({
        id: str(template.id),
        name: str(template.name),
        description: nullableStr(template.description),
        type: str(template.type),
        group,
        file_name: str(template.file_name),
        visibility: entry.visibility,
      });
    }
  }

  return {
    restrict_visibility: documents.restrictVisibility === true,
    items,
  };
}

/**
 * `templatesById` porte le catalogue de documents du périmètre : sans lui, le
 * champ `documents` serait vide alors que la démarche en propose. Tout appelant
 * doit donc le fournir — d'où le paramètre requis.
 */
export function serializeProcedure(row: Row, templatesById: Map<string, Row>): ProcedureDto {
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
    documents: serializeProcedureDocuments(row.communication_config, templatesById),
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

/** `#RRGGBB` → `#rrggbb` ; tout le reste → `null`. */
function hexColor(value: unknown): string | null {
  const raw = nonEmpty(value);
  if (raw === null) return null;
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : null;
}

/**
 * Charte graphique applicable, à partir d'une ligne de `resolve_branding`
 * (héritage déjà résolu en base). `row` nul ⇒ charte vide et `configured:false`
 * — jamais une erreur : une collectivité qui n'a rien rempli est un cas normal.
 */
export function serializeBranding(organizationId: string, row: Row | null): BrandingDto {
  const sourceId = nullableStr(row?.source_organization_id);
  const logoUrl = nonEmpty(row?.logo_url);
  const logoWhiteUrl = nonEmpty(row?.logo_white_url);
  const primaryColor = hexColor(row?.primary_color);
  const secondaryColor = hexColor(row?.secondary_color);
  const configured =
    logoUrl !== null || logoWhiteUrl !== null || primaryColor !== null || secondaryColor !== null;

  return {
    organization_id: organizationId,
    source_organization_id: sourceId,
    // Une source absente n'est pas « héritée » : c'est l'absence de charte.
    inherited: sourceId !== null && sourceId !== organizationId,
    configured,
    logo_url: logoUrl,
    logo_white_url: logoWhiteUrl,
    primary_color: primaryColor,
    secondary_color: secondaryColor,
  };
}

/**
 * Collectivité servie par un domaine du portail. Whitelist la plus étroite de
 * ce fichier — quatre champs — parce que c'est la seule dont la destination est
 * une page publique : tout champ ajouté ici devient lisible par n'importe quel
 * visiteur du portail.
 */
export function serializeTenant(
  row: Row,
  hostname: string,
  languages: unknown,
  theme: unknown,
): TenantDto {
  return {
    id: str(row.id),
    name: str(row.name),
    slug: nullableStr(row.slug),
    hostname,
    languages: readLanguages(languages),
    // Rien de publié ⇒ les défauts du Socle, jamais `null` : voir
    // `serializePortalTheme`.
    theme: serializePortalTheme(theme),
  };
}

/**
 * Langues servies au portail. La résolution (remontée jusqu'à la racine) est
 * faite en base par `resolve_org_languages` ; il reste à se prémunir de ce qui
 * n'est pas une liste de codes, et à garantir la seule chose sur laquelle un
 * consommateur peut s'appuyer sans réfléchir : **le français est là, en tête**.
 * Une collectivité sans réglage n'est pas une collectivité sans langue.
 *
 * ⚠️ **Miroir volontaire** de `parseEnabledLanguages`
 * (`src/features/languages/languages.ts`) : une edge function ne peut rien
 * importer de `src/`. Les tests des deux côtés épinglent les mêmes règles.
 */
const LANGUAGE_CODE_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/;

function readLanguages(value: unknown): string[] {
  const out = ["fr"];
  if (!Array.isArray(value)) return out;
  for (const item of value) {
    if (typeof item !== "string") continue;
    const code = item.trim().toLowerCase();
    if (!LANGUAGE_CODE_RE.test(code) || out.includes(code)) continue;
    out.push(code);
  }
  return out;
}

/** Les trois publics du paramétrage, dans l'ordre où ils s'affichent. */
const AUDIENCES = ["citoyen", "entreprise", "association"] as const;

/**
 * Les publics ACTIVÉS d'une démarche, lus dans `requester_config`.
 *
 * ⚠️ **Miroir volontaire** d'`enabledAudiences`
 * (`src/features/procedures/requesterFields.ts`) : une edge function ne peut
 * rien importer de `src/`, et les tests des deux côtés l'épinglent — motif
 * `portalCatalogue.ts`.
 *
 * ⚠️ Seuls les NOMS des publics traversent, jamais la configuration des champs
 * qui les accompagne : quelles informations sont demandées au requérant, et
 * lesquelles sont obligatoires, appartiennent au détail
 * (`GET /v1/portal/procedures/{id}`), pas à une liste. La liste répond à « à
 * qui cette démarche s'adresse-t-elle ? », pas à « que va-t-on me demander ? ».
 *
 * ⚠️ Une colonne absente ou jamais paramétrée rend une liste **vide**, jamais
 * les trois publics : rien n'a été déclaré, et le déclarer à la place de la
 * collectivité ferait apparaître la démarche sous des publics auxquels elle
 * n'est pas ouverte.
 */
export function readAudiences(raw: unknown): Array<"citoyen" | "entreprise" | "association"> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const config = raw as Record<string, unknown>;
  return AUDIENCES.filter((key) => {
    const entry = config[key];
    return !!entry && typeof entry === "object" && (entry as Record<string, unknown>).enabled === true;
  });
}

/**
 * Démarche pour le portail usagers. Une whitelist étroite — aucun élément du
 * paramétrage d'instruction ne franchit. Le filtrage de PUBLICATION est fait en
 * amont (`publishedCatalogue`) : ce sérialiseur ne décide pas ce qui est publié,
 * il décide ce qui est montré. Les organismes qui proposent la démarche arrivent
 * déjà résolus, dans l'ordre de l'arbre ; ils sont recopiés champ par champ,
 * comme tout le reste.
 *
 * ⚠️ `audiences` est le seul champ DÉRIVÉ : il est extrait de
 * `requester_config`, qui ne sort pas de la liste (voir `readAudiences`). Ce
 * n'est pas une entorse à la whitelist, c'en est l'application — on sert les
 * noms des publics, pas la configuration qui les porte.
 */
/**
 * Ce que `publishedCatalogue` produit pour chaque organisme : la forme
 * INTERNE (camelCase), que ce sérialiseur convertit en DTO. Les deux sont
 * volontairement distinctes — le nommage du contrat public ne suit pas celui
 * du code qui le calcule.
 */
export interface PortalOrganizationInput {
  id: string;
  name: string;
  handlingOrganizationId: string | null;
}

export function serializePortalProcedure(
  row: Row,
  organizations: PortalOrganizationInput[] = [],
): PortalProcedureDto {
  return {
    id: str(row.id),
    name: str(row.name),
    short_description: nullableStr(row.short_description),
    user_description: nullableStr(row.user_description),
    input_duration_minutes: nullableNum(row.input_duration_minutes),
    organizations: organizations.map((org) => ({
      id: str(org.id),
      name: str(org.name),
      handling_organization_id: nullableStr(org.handlingOrganizationId),
    })),
    audiences: readAudiences(row.requester_config),
    translations: row.translations ?? null,
  };
}

/**
 * Démarche du portail, version détaillée : le public de la liste, plus la
 * catégorie et les deux schémas de saisie. Ici encore le sérialiseur ne décide
 * pas ce qui est publié — l'appelant ne lui passe que des démarches déjà
 * retenues par `publishedCatalogue`.
 *
 * `form_schema` et `requester_config` sont recopiés TELS QUELS : ce sont des
 * schémas possédés, versionnés, que le consommateur parse avec sa propre
 * tolérance. Les réécrire ici en ferait une seconde grammaire.
 */
export function serializePortalProcedureDetail(
  row: Row,
  organizations: PortalOrganizationInput[] = [],
  detail: Row | null = null,
  category: Row | null = null,
): PortalProcedureDetailDto {
  return {
    ...serializePortalProcedure(row, organizations),
    category:
      category === null
        ? null
        : {
            id: str(category.id),
            name: str(category.name),
            translations: category.translations ?? null,
          },
    form_schema: detail?.form_schema ?? null,
    requester_config: detail?.requester_config ?? null,
  };
}
