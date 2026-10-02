/**
 * Import des démarches d'un partenaire (Arpège) dans le catalogue de la
 * collectivité — appelé par l'écran du super administrateur (fiche client,
 * section « Intégrations », bouton « Récupérer les démarches »).
 *
 * Les démarches arrivent dans le catalogue de la RACINE, rangées dans la
 * catégorie « Démarches <partenaire> » (créée au besoin), marquées
 * `integration_id` + `external_reference`, avec la configuration du partenaire
 * (`partner_config`, opaque). Elles s'activent ensuite organisation par
 * organisation dans l'écran « Démarches activées », comme les autres — l'API
 * Arpège ne dit rien de quel service propose quoi.
 *
 * Un nouvel import ne touche ni la catégorie, ni le statut, ni les activations,
 * et ne supprime jamais une démarche disparue du partenaire (voir
 * `_shared/importPlan.ts`).
 *
 * ⚠️ AUCUN SECRET DANS LES JOURNAUX NI DANS LA RÉPONSE — `index.test.ts`
 * (dans `_shared/`) lit ce fichier pour le vérifier.
 *
 * Déployée avec `verify_jwt = true` ; l'autorisation fine (`is_super_admin`)
 * est vérifiée avec les droits de l'appelant.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { fetchArpegeCatalogue, type Values } from "./_shared/arpegeCatalogue.ts";
import { partnerCategoryName, planImport, type ExistingPartnerProcedure } from "./_shared/importPlan.ts";

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
  const { data: existingRows, error: existingError } = await admin
    .from("procedures")
    .select("id, external_reference, name, short_description, partner_config")
    .eq("organization_id", rootId)
    .eq("integration_id", config.integration_id);
  if (existingError) {
    console.error("integration-procedures: lecture du catalogue impossible", existingError.code);
    return errorResponse(500, "Erreur interne.");
  }

  const plan = planImport((existingRows ?? []) as ExistingPartnerProcedure[], catalogue.procedures);

  // Catégorie « Démarches <partenaire> » de la racine — seulement s'il y a à créer.
  let categoryId: string | null = null;
  if (plan.toInsert.length > 0) {
    const categoryName = partnerCategoryName(integration.name);
    const { data: category, error: categoryError } = await admin
      .from("categories")
      .select("id")
      .eq("organization_id", rootId)
      .eq("name", categoryName)
      .limit(1)
      .maybeSingle();
    if (categoryError) {
      console.error("integration-procedures: lecture de la catégorie impossible", categoryError.code);
      return errorResponse(500, "Erreur interne.");
    }
    categoryId = category?.id ?? null;
    if (!categoryId) {
      const { data: created, error: createError } = await admin
        .from("categories")
        .insert({ organization_id: rootId, name: categoryName })
        .select("id")
        .single();
      if (createError) {
        console.error("integration-procedures: création de la catégorie impossible", createError.code);
        return errorResponse(500, "Erreur interne.");
      }
      categoryId = created.id;
    }
  }

  if (plan.toInsert.length > 0) {
    const { error: insertError } = await admin.from("procedures").insert(
      plan.toInsert.map((procedure) => ({
        organization_id: rootId,
        category_id: categoryId,
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
    if (insertError) {
      console.error("integration-procedures: création des démarches impossible", insertError.code);
      return errorResponse(500, "Erreur interne.");
    }
  }

  for (const update of plan.toUpdate) {
    const { error: updateError } = await admin
      .from("procedures")
      .update({ name: update.name, short_description: update.short_description, partner_config: update.partner_config })
      .eq("id", update.id);
    if (updateError) {
      console.error("integration-procedures: mise à jour d'une démarche impossible", updateError.code);
      return errorResponse(500, "Erreur interne.");
    }
  }

  return jsonResponse(200, {
    created: plan.toInsert.length,
    updated: plan.toUpdate.length,
    unchanged: plan.unchanged,
    missing: plan.missing,
  });
});
