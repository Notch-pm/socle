/**
 * Import des démarches d'un partenaire (Arpège) dans le catalogue de la
 * collectivité — appelé par l'écran du super administrateur (fiche client,
 * section « Intégrations », bouton « Récupérer les démarches »).
 *
 * Les démarches arrivent dans le catalogue de la RACINE, chacune rangée dans la
 * catégorie de son partenaire (Arpège : son « métier », `/v2/Metiers`, importé
 * en catégorie « <Libellé> (Arpège) »), marquées `integration_id` +
 * `external_reference`, avec la configuration du partenaire (`partner_config`,
 * opaque). Elles s'activent ensuite organisation par organisation dans l'écran
 * « Démarches activées », comme les autres — l'API Arpège ne dit rien de quel
 * service propose quoi.
 *
 * Un nouvel import ne touche ni le statut ni les activations, ne déplace pas
 * une démarche rangée à la main dans une catégorie du Socle, et ne supprime
 * jamais une démarche disparue du partenaire (voir `_shared/importPlan.ts`).
 * L'ancienne catégorie fourre-tout « Démarches <partenaire> » est vidée puis
 * retirée.
 *
 * ⚠️ AUCUN SECRET DANS LES JOURNAUX NI DANS LA RÉPONSE — `index.test.ts`
 * (dans `_shared/`) lit ce fichier pour le vérifier.
 *
 * Déployée avec `verify_jwt = true` ; l'autorisation fine (`is_super_admin`)
 * est vérifiée avec les droits de l'appelant.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { fetchArpegeCatalogue, type Values } from "./_shared/arpegeCatalogue.ts";
import {
  partnerCategoryName,
  planCategories,
  planImport,
  type ExistingPartnerCategory,
  type ExistingPartnerProcedure,
} from "./_shared/importPlan.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, message: string): Response {
  return jsonResponse(status, { error: { message } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readValues(raw: unknown): Values {
  const values: Values = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "string") values[key] = value;
    }
  }
  return values;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse(405, "Méthode non autorisée.");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return errorResponse(401, "Non autorisé.");

  let organizationIntegrationId: unknown;
  try {
    ({ organization_integration_id: organizationIntegrationId } = await req.json());
  } catch {
    return errorResponse(400, "Corps JSON invalide.");
  }
  if (typeof organizationIntegrationId !== "string" || !UUID_RE.test(organizationIntegrationId)) {
    return errorResponse(400, "organization_integration_id requis.");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await callerClient.auth.getUser();
  if (!user) return errorResponse(401, "Non autorisé.");
  const { data: isSuperAdmin } = await callerClient.rpc("is_super_admin");
  if (isSuperAdmin !== true) return errorResponse(403, "Accès refusé.");

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: config, error: configError } = await admin
    .from("organization_integrations")
    .select("id, organization_id, integration_id, settings, is_active, integrations(name, adapter)")
    .eq("id", organizationIntegrationId)
    .maybeSingle();
  if (configError) {
    console.error("integration-procedures: lecture de la configuration impossible", configError.code);
    return errorResponse(500, "Erreur interne.");
  }
  if (!config) return errorResponse(404, "Configuration introuvable.");
  const integration = config.integrations as { name: string; adapter: string | null } | null;
  if (integration?.adapter !== "arpege") {
    return errorResponse(409, "Cette intégration ne sait pas encore importer de démarches.");
  }
  if (!config.is_active) {
    return errorResponse(409, "Activez l'intégration avant de récupérer ses démarches.");
  }

  const { data: secretRow, error: secretError } = await admin
    .from("organization_integration_secrets")
    .select("secrets")
    .eq("organization_integration_id", config.id)
    .maybeSingle();
  if (secretError) {
    console.error("integration-procedures: lecture des secrets impossible", secretError.code);
    return errorResponse(500, "Erreur interne.");
  }

  const catalogue = await fetchArpegeCatalogue(readValues(config.settings), readValues(secretRow?.secrets));
  if (!catalogue.ok) return errorResponse(502, catalogue.message);

  const rootId = config.organization_id as string;
  const fail = (what: string, code: string | undefined) => {
    console.error("integration-procedures: écriture impossible", code);
    return errorResponse(500, `Erreur interne (${what}).`);
  };

  // ── 1. Catégories du partenaire (« <Libellé> (<Partenaire>) ») ──
  const { data: categoryRows, error: categoryError } = await admin
    .from("categories")
    .select("id, external_reference, name")
    .eq("organization_id", rootId)
    .eq("integration_id", config.integration_id);
  if (categoryError) return fail("catégories", categoryError.code);

  const categoryPlan = planCategories(
    (categoryRows ?? []) as ExistingPartnerCategory[],
    catalogue.categories,
    integration.name,
  );
  const idByReference = new Map(
    ((categoryRows ?? []) as ExistingPartnerCategory[]).map((row) => [row.external_reference, row.id]),
  );
  if (categoryPlan.toInsert.length > 0) {
    const { data: created, error } = await admin
      .from("categories")
      .insert(
        categoryPlan.toInsert.map((category) => ({
          organization_id: rootId,
          name: category.name,
          integration_id: config.integration_id,
          external_reference: category.reference,
        })),
      )
      .select("id, external_reference");
    if (error) return fail("catégories", error.code);
    for (const row of created ?? []) idByReference.set(row.external_reference as string, row.id as string);
  }
  for (const rename of categoryPlan.toRename) {
    const { error } = await admin.from("categories").update({ name: rename.name }).eq("id", rename.id);
    if (error) return fail("catégories", error.code);
  }

  // Ancienne catégorie fourre-tout « Démarches <partenaire> » (import du
  // 2026-10-02, non marquée) : gérée, donc ses démarches rejoignent leur vraie
  // catégorie ; supprimée ensuite si elle est vide.
  const legacyName = partnerCategoryName(integration.name);
  const { data: legacyRows, error: legacyError } = await admin
    .from("categories")
    .select("id")
    .eq("organization_id", rootId)
    .is("integration_id", null)
    .eq("name", legacyName);
  if (legacyError) return fail("catégories", legacyError.code);
  const legacyIds = (legacyRows ?? []).map((row) => row.id as string);
  const managedIds = new Set<string>([...idByReference.values(), ...legacyIds]);

  // ── 2. Démarches ──
  const { data: existingRows, error: existingError } = await admin
    .from("procedures")
    .select("id, external_reference, name, short_description, partner_config, category_id")
    .eq("organization_id", rootId)
    .eq("integration_id", config.integration_id);
  if (existingError) return fail("démarches", existingError.code);

  // Repli d'une démarche sans catégorie chez le partenaire : la fourre-tout,
  // créée seulement si une telle démarche est à créer.
  let fallbackId: string | null = legacyIds[0] ?? null;
  const needsFallback = catalogue.procedures.some((p) => !p.categoryReference || !idByReference.has(p.categoryReference));
  if (!fallbackId && needsFallback) {
    const { data: created, error } = await admin
      .from("categories")
      .insert({ organization_id: rootId, name: legacyName })
      .select("id")
      .single();
    if (error) return fail("catégories", error.code);
    fallbackId = created.id;
  }

  const plan = planImport((existingRows ?? []) as ExistingPartnerProcedure[], catalogue.procedures, {
    idByReference,
    managedIds,
    fallbackId,
  });

  if (plan.toInsert.length > 0) {
    const { error: insertError } = await admin.from("procedures").insert(
      plan.toInsert.map((procedure) => ({
        organization_id: rootId,
        category_id: procedure.category_id,
        name: procedure.name,
        short_description: procedure.description,
        integration_id: config.integration_id,
        external_reference: procedure.reference,
        partner_config: procedure.config,
        // Le paramétrage de la démarche est fait chez le partenaire.
        status: "production",
        type: "externe",
      })),
    );
    if (insertError) return fail("démarches", insertError.code);
  }

  for (const update of plan.toUpdate) {
    const { error: updateError } = await admin
      .from("procedures")
      .update({
        name: update.name,
        short_description: update.short_description,
        partner_config: update.partner_config,
        category_id: update.category_id,
      })
      .eq("id", update.id);
    if (updateError) return fail("démarches", updateError.code);
  }

  // ── 3. Fourre-tout vidée : on la retire (jamais si une démarche y reste) ──
  for (const legacyId of legacyIds) {
    if (legacyId === fallbackId && needsFallback) continue;
    const { count, error } = await admin
      .from("procedures")
      .select("id", { count: "exact", head: true })
      .eq("category_id", legacyId);
    if (error) return fail("catégories", error.code);
    if ((count ?? 0) === 0) {
      const { error: deleteError } = await admin.from("categories").delete().eq("id", legacyId);
      if (deleteError) return fail("catégories", deleteError.code);
    }
  }

  return jsonResponse(200, {
    created: plan.toInsert.length,
    updated: plan.toUpdate.length,
    unchanged: plan.unchanged,
    recategorized: plan.recategorized,
    categories_created: categoryPlan.toInsert.length,
    categories_renamed: categoryPlan.toRename.length,
    missing: plan.missing,
  });
});
