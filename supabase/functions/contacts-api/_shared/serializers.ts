/**
 * Sérialiseurs : lignes DB (brutes, éventuellement issues d'un `select *`) →
 * DTO publics. **Whitelist stricte** comme dans `public-api` : chaque champ
 * exposé est recopié explicitement, aucune colonne ajoutée demain ne fuira par
 * accident. Logique pure et testée.
 */
import type {
  ContactDto,
  ContactExternalReferenceDto,
  ContactRelationDto,
  ContactRoleDto,
  ContactRoleRefDto,
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

export function serializeContactRoleRef(row: Row): ContactRoleRefDto {
  return { id: str(row.id), name: str(row.name) };
}

export function serializeExternalReference(row: Row): ContactExternalReferenceDto {
  return {
    id: str(row.id),
    source: str(row.source),
    external_id: str(row.external_id),
    created_at: nullableStr(row.created_at),
    updated_at: nullableStr(row.updated_at),
  };
}

/** Ligne de relation pré-jointe : { id, role: Row, peer: Row } (l'autre contact). */
export function serializeContactRelation(row: Row): ContactRelationDto {
  const role = (row.role ?? {}) as Row;
  const peer = (row.peer ?? {}) as Row;
  return {
    id: str(row.id),
    role: serializeContactRoleRef(role),
    contact: {
      id: str(peer.id),
      display_name: nullableStr(peer.display_name),
      contact_type: str(peer.contact_type),
    },
  };
}

export function serializeContact(
  row: Row,
  roles: Row[],
  externalRefs: Row[],
  relations: Row[] = [],
  reverseRelations: Row[] = [],
): ContactDto {
  return {
    id: str(row.id),
    organization_id: str(row.organization_id),
    contact_type: str(row.contact_type),
    civility: nullableStr(row.civility),
    first_name: nullableStr(row.first_name),
    last_name: nullableStr(row.last_name),
    usage_name: nullableStr(row.usage_name),
    birth_date: nullableStr(row.birth_date),
    legal_name: nullableStr(row.legal_name),
    siret: nullableStr(row.siret),
    display_name: nullableStr(row.display_name),
    email: nullableStr(row.email),
    mobile_phone: nullableStr(row.mobile_phone),
    landline_phone: nullableStr(row.landline_phone),
    address_line1: nullableStr(row.address_line1),
    address_line2: nullableStr(row.address_line2),
    postal_code: nullableStr(row.postal_code),
    city: nullableStr(row.city),
    country: str(row.country),
    address_lat: nullableNum(row.address_lat),
    address_lon: nullableNum(row.address_lon),
    quartier_id: nullableStr(row.quartier_id),
    quartier_auto: Boolean(row.quartier_auto),
    preferred_channel: nullableStr(row.preferred_channel),
    consent_email: Boolean(row.consent_email),
    consent_sms: Boolean(row.consent_sms),
    internal_notes: nullableStr(row.internal_notes),
    status: str(row.status),
    roles: roles.map(serializeContactRoleRef),
    external_references: externalRefs.map(serializeExternalReference),
    relations: relations.map(serializeContactRelation),
    reverse_relations: reverseRelations.map(serializeContactRelation),
    created_at: nullableStr(row.created_at),
    updated_at: nullableStr(row.updated_at),
  };
}

export function serializeContactRole(row: Row): ContactRoleDto {
  return {
    id: str(row.id),
    organization_id: str(row.organization_id),
    name: str(row.name),
    created_at: nullableStr(row.created_at),
  };
}
