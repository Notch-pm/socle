/**
 * Catalogue des démarches Arpège d'une collectivité — lecture de l'API
 * Interop v2. PORTÉ de Clara (`supabase/functions/sync-arpege-services/index.ts`,
 * `runSync`) : mêmes appels, mêmes replis, même filtre de publication, même
 * forme de configuration (`arpege_config_fields` côté Clara = `partner_config`
 * ici). On n'a rien réinventé : Clara affiche le formulaire Arpège à partir de
 * ces données, elles doivent lui arriver à l'identique.
 *
 * Pure (aucune API Deno, `fetch` injectable) : testée par vitest.
 */
import { buildHawkHeader, resolveArpegeUrl, resolveHawkCredentials } from "./hawk.ts";

export type Values = Record<string, string | undefined>;

/** Une catégorie Arpège (« métier », `GET /v2/Metiers`). */
export interface ArpegeCategory {
  /** CodeQualificationMetier. */
  reference: string;
  /** LibelleQualificationMetier (repli : le code). */
  name: string;
}

/** Une démarche Arpège telle que le Socle la range au catalogue. */
export interface ArpegeProcedure {
  /** CodeQualificationTypeDemande (repli : IdTypeDemande, Id). */
  reference: string;
  name: string;
  description: string | null;
  /** Code de sa catégorie Arpège (CodeQualificationMetier) ; `null` si absent. */
  categoryReference: string | null;
  /** Opaque pour le Socle — `arpege_config_fields` de Clara. */
  config: {
    CodeQualificationMetier: unknown;
    ConfigInfoUsagerObligs: unknown[];
    FormComponents: unknown[] | null;
  };
}

export type CatalogueResult =
  | { ok: true; procedures: ArpegeProcedure[]; categories: ArpegeCategory[] }
  | { ok: false; message: string };

export const FETCH_TIMEOUT_MS = 20_000;

// deno-lint-ignore no-explicit-any
type Any = any;

/** Règle de Clara : `Data.Results` / `Data.results` / `Data` / racine tableau. */
export function extractArray(data: Any): Any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.Data?.Results)) return data.Data.Results;
  if (Array.isArray(data?.Data?.results)) return data.Data.results;
  if (Array.isArray(data?.Data)) return data.Data;
  return [];
}

/**
 * Transforme les trois réponses Arpège en catalogue. Fonction pure : c'est
 * elle que les tests éprouvent.
 *   • `formData`     — `/v2/Demandes?scope=data_formulaire,…` : un formulaire par type ;
 *   • `typesData`    — `/v2/TypesDemandes` ;
 *   • `fallbackData` — `/v2/Demandes?pageSize=200`, lu seulement si `typesData` est vide.
 */
export function parseCatalogue(formData: Any, typesData: Any, fallbackData: Any): ArpegeProcedure[] {
  const formByType = new Map<string, unknown[]>();
  for (const item of extractArray(formData)) {
    const typeCode = item?.data_administratives?.CodeQualificationTypeDemande;
    const components = item?.data_formulaire?.Components;
    if (typeCode && Array.isArray(components) && !formByType.has(typeCode)) {
      formByType.set(typeCode, components);
    }
  }

  let types: Any[] = extractArray(typesData);
  if (types.length === 0) {
    const byId = new Map<string, Any>();
    for (const d of extractArray(fallbackData)) {
      const typeId = String(d?.IdTypeDemande || d?.TypeDemande?.Id || "");
      const typeName = d?.LibelleTypeDemande || d?.TypeDemande?.Libelle || d?.TypeDemarche || "";
      if (typeId && typeName && !byId.has(typeId)) byId.set(typeId, { IdTypeDemande: typeId, Libelle: typeName });
    }
    types = Array.from(byId.values());
  }

  const seen = new Set<string>();
  const procedures: ArpegeProcedure[] = [];
  for (const td of types) {
    // Règle de Clara : publiée, ou sans état (certains points d'accès ne le renvoient pas).
    const etat = td?.TypeEtatPublication || td?.typeEtatPublication || "";
    if (etat !== "ENLIGNE" && etat !== "") continue;

    const reference = String(td?.CodeQualificationTypeDemande || td?.IdTypeDemande || td?.Id || "").trim();
    const name = String(td?.LibelleQualificationTypeDemande || td?.Libelle || td?.Label || td?.Nom || "").trim();
    if (!reference || !name || seen.has(reference)) continue;
    seen.add(reference);

    const description = typeof td?.Description === "string" && td.Description.trim() !== ""
      ? td.Description.trim()
      : typeof td?.description === "string" && td.description.trim() !== ""
        ? td.description.trim()
        : null;

    const metier = typeof td?.CodeQualificationMetier === "string" ? td.CodeQualificationMetier.trim() : "";
    procedures.push({
      reference,
      name,
      description,
      categoryReference: metier || null,
      config: {
        CodeQualificationMetier: td?.CodeQualificationMetier || null,
        ConfigInfoUsagerObligs: (Array.isArray(td?.ConfigInfoUsagerObligs) ? td.ConfigInfoUsagerObligs : []).filter(
          (f: Any) => f?.Etat === "ENLIGNE",
        ),
        FormComponents: formByType.get(reference) ?? null,
      },
    });
  }
  return procedures;
}

/**
 * Catégories Arpège (`/v2/Metiers`) — seules celles qu'emploie au moins une
 * démarche du catalogue : une catégorie vide n'aurait rien à ranger. Un métier
 * employé mais absent de `/v2/Metiers` prend son code pour libellé.
 */
export function parseCategories(metiersData: Any, procedures: ArpegeProcedure[]): ArpegeCategory[] {
  const labels = new Map<string, string>();
  for (const m of extractArray(metiersData)) {
    const code = typeof m?.CodeQualificationMetier === "string" ? m.CodeQualificationMetier.trim() : "";
    const label = typeof m?.LibelleQualificationMetier === "string" ? m.LibelleQualificationMetier.trim() : "";
    if (code && !labels.has(code)) labels.set(code, label || code);
  }
  const used = [...new Set(procedures.map((p) => p.categoryReference).filter((c): c is string => c !== null))];
  return used
    .map((reference) => ({ reference, name: labels.get(reference) ?? reference }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/** GET signé Hawk ; `null` sur échec HTTP, réseau, ou `IsSuccess: false` (règle de Clara). */
async function fetchSigned(url: string, id: string, key: string, fetchImpl: typeof fetch): Promise<Any | null> {
  try {
    const response = await fetchImpl(url, {
      headers: { Authorization: await buildHawkHeader(url, "GET", id, key), Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const data = await response.json();
    return data?.IsSuccess === false ? null : data;
  } catch {
    return null;
  }
}

/** Lit le catalogue d'une collectivité. Aucun secret dans les messages. */
export async function fetchArpegeCatalogue(
  settings: Values,
  secrets: Values,
  fetchImpl: typeof fetch = fetch,
): Promise<CatalogueResult> {
  const apiBaseUrl = (settings.api_base_url ?? "").trim();
  if (!apiBaseUrl) return { ok: false, message: "URL de l'API manquante." };
  const { hawkId, hawkKey } = resolveHawkCredentials({
    client_id: settings.client_id,
    client_secret: secrets.client_secret,
    access_token: secrets.access_token,
  });
  if (!hawkId || !hawkKey) return { ok: false, message: "Identifiants Arpège manquants." };
  const base = resolveArpegeUrl(apiBaseUrl);
  if (!base.startsWith("https://")) return { ok: false, message: "L'URL de l'API doit commencer par https://." };

  const formData = await fetchSigned(
    `${base}/v2/Demandes?scope=data_formulaire,data_administratives&TypeDemarches=DEMANDE&pageSize=200`,
    hawkId,
    hawkKey,
    fetchImpl,
  );
  const typesData = await fetchSigned(`${base}/v2/TypesDemandes`, hawkId, hawkKey, fetchImpl);
  const fallbackData = extractArray(typesData).length === 0
    ? await fetchSigned(`${base}/v2/Demandes?pageSize=200`, hawkId, hawkKey, fetchImpl)
    : null;

  if (typesData === null && fallbackData === null) {
    return { ok: false, message: "Arpège n'a pas renvoyé de liste de démarches (connexion ou droits)." };
  }
  const procedures = parseCatalogue(formData, typesData, fallbackData);
  // Sans `/v2/Metiers`, les catégories prennent leur code pour libellé.
  const metiersData = await fetchSigned(`${base}/v2/Metiers`, hawkId, hawkKey, fetchImpl);
  return { ok: true, procedures, categories: parseCategories(metiersData, procedures) };
}
