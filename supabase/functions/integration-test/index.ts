/**
 * Test de connexion d'une intégration partenaire — appelé par l'écran du super
 * administrateur (fiche client, section « Intégrations »).
 *
 * POURQUOI CÔTÉ SERVEUR : les secrets d'une intégration ne quittent jamais la
 * base (`organization_integration_secrets`, illisible par tout client). Seul
 * le service role les lit — ici, pour signer l'appel, et nulle part ailleurs
 * dans le Socle.
 *
 * Le Socle ne fait QUE tester : le métier (créer une demande Arpège, suivre son
 * statut) reste dans l'application qui l'exécute. Le résultat est écrit sur
 * la configuration (`last_test_*`) : c'est lui qui autorise l'activation
 * (trigger `guard_organization_integration_test`).
 *
 * ⚠️ AUCUN SECRET DANS LES JOURNAUX NI DANS LA RÉPONSE : ni en-tête Hawk, ni
 * identifiant, ni corps de requête. `index.test.ts` lit ce fichier pour le
 * vérifier (Ariane journalisait les 60 premiers caractères de l'en-tête).
 *
 * Déployée avec `verify_jwt = true` (voir `supabase/config.toml`) ;
 * l'autorisation fine (`is_super_admin`) est vérifiée avec les droits de
 * l'appelant.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getAdapter, readValues } from "./_shared/adapters.ts";

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
    .select("id, settings, integrations(adapter)")
    .eq("id", organizationIntegrationId)
    .maybeSingle();
  if (configError) {
    console.error("integration-test: lecture de la configuration impossible", configError.code);
    return errorResponse(500, "Erreur interne.");
  }
  if (!config) return errorResponse(404, "Configuration introuvable.");

  const catalogue = config.integrations as { adapter: string | null } | null;
  const adapter = getAdapter(catalogue?.adapter);
  if (!adapter) return errorResponse(409, "Cette intégration n'est pas encore configurable.");

  const { data: secretRow, error: secretError } = await admin
    .from("organization_integration_secrets")
    .select("secrets")
    .eq("organization_integration_id", config.id)
    .maybeSingle();
  if (secretError) {
    console.error("integration-test: lecture des secrets impossible", secretError.code);
    return errorResponse(500, "Erreur interne.");
  }

  const result = await adapter.test(readValues(config.settings), readValues(secretRow?.secrets));

  // Le résultat décrit la configuration EN PLACE : s'il échoue, l'intégration
  // reste active (c'est au super administrateur de la suspendre), mais son
  // statut passe « En erreur ».
  const { error: writeError } = await admin
    .from("organization_integrations")
    .update({
      last_tested_at: new Date().toISOString(),
      last_test_ok: result.ok,
      last_test_error: result.ok ? null : result.message.slice(0, 500),
    })
    .eq("id", config.id);
  if (writeError) {
    console.error("integration-test: écriture du résultat impossible", writeError.code);
    return errorResponse(500, "Erreur interne.");
  }

  return jsonResponse(200, result);
});
