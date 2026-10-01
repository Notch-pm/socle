/**
 * Attributions des organisations — `GET /v1/organizations/attributions?tenant_id=`
 * (contrat 1.33.0). Ce que chaque organisme TRAITE et ne traite pas, pour les
 * agents et leurs outils IA (premier consommateur : Clara, qui propose le
 * service instructeur d'un courrier).
 *
 * ⚠️ **Interne** : aucune route `/v1/portal/*` ne le sert (un test d'OpenAPI
 * l'épingle). ⚠️ **Services internes compris**, contrairement aux
 * informations usagers : ce sont souvent eux qui instruisent. Pas d'héritage.
 *
 * ⚠️ Miroir volontaire de `src/features/organizations/attributions.ts` (une
 * edge function ne peut rien importer de `src/`) ; un test épingle la borne.
 * Pur, sans Deno : testé par vitest, déployé avec `index.ts`.
 */
import type { OrganizationAttributionsDto } from "./dto.ts";

export const MAX_ATTRIBUTIONS_LENGTH = 2_000;

export interface AttributionsOrganization {
  id: string;
  name: string;
  status: string | null;
  is_internal_service: boolean | null;
}

/**
 * Une entrée par organisme **actif** du sous-arbre qui a écrit quelque chose
 * (texte non blanc), service interne compris. La collectivité en tête, puis
 * par nom. Rien d'écrit ⇒ `[]`.
 */
export function serializeOrganizationAttributions(
  tenantId: string,
  organizations: AttributionsOrganization[],
  rows: Array<{ organization_id: unknown; attributions: unknown; updated_at: unknown }>,
): OrganizationAttributionsDto[] {
  const byOrg = new Map(rows.map((row) => [String(row.organization_id), row]));
  const out: Array<OrganizationAttributionsDto & { is_tenant: boolean }> = [];
  for (const org of organizations) {
    if (org.status !== "active") continue;
    const row = byOrg.get(org.id);
    const text = typeof row?.attributions === "string" ? row.attributions.trim() : "";
    if (text === "") continue;
    out.push({
      id: org.id,
      name: org.name,
      is_internal_service: org.is_internal_service === true,
      attributions: text,
      updated_at: typeof row?.updated_at === "string" ? row.updated_at : null,
      is_tenant: org.id === tenantId,
    });
  }
  return out
    .sort((a, b) =>
      a.is_tenant !== b.is_tenant ? (a.is_tenant ? -1 : 1) : a.name.localeCompare(b.name, "fr"),
    )
    .map(({ is_tenant: _tenant, ...dto }) => dto);
}
