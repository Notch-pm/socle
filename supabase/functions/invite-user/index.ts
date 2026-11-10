import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";
import {
  resolveSmtp,
  senderHeader,
  siteNameFor,
  useImplicitTls,
  type SmtpConfig,
  type SmtpRow,
} from "./_shared/smtp.ts";
import { renderBrandedEmail } from "./_shared/emailLayout.ts";
import {
  accessRows,
  applicationAccessRefusal,
  parseAccessRequest,
  requestedOrganizationIds,
  type AccessRequest,
} from "./_shared/accessRequest.ts";
import { welcomeApps, welcomeMessage, type WelcomeApp } from "./_shared/welcome.ts";

// Ouverture des accès d'un agent, et renvoi de son message de bienvenue.
//
// Deux actions sur le même corps JSON :
//   • (défaut) créer le compte s'il n'existe pas, le rattacher, envoyer le
//     message de bienvenue ;
//   • `action: "resend"` — renvoyer ce message (courriel perdu, boîte pleine).
//
// Connexion unique (lot 4, 2026-11-10) : plus de lien « choisissez votre mot
// de passe ». L'agent s'identifie par Keycloak pour toute la gamme ; le Socle
// envoie UN message (`_shared/welcome.ts`) qui liste les applications ouvertes
// et dit comment s'y connecter — Clara et Iris n'envoient plus rien.
//
// Le courriel part par le relais de la COLLECTIVITÉ, ou par le relais de
// PLATEFORME en repli (`_shared/smtp.ts`) : une collectivité qui vient d'être
// créée peut inviter son premier administrateur avant d'avoir saisi son SMTP.
//
// Autorisation : `is_admin_of_self_or_ancestor`, évaluée AVEC LES DROITS DE
// L'APPELANT (client anon + son JWT) — la même garde que `send-test-email` et
// que le RLS de `smtp_settings`. L'écran des utilisateurs s'affiche sur toute
// organisation : un administrateur de racine doit pouvoir inviter dans une
// sous-organisation, ce que l'ancienne garde `is_org_admin` (admin DIRECT)
// refusait.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendViaSMTP(smtp: SmtpConfig, to: string, subject: string, html: string, text: string) {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: useImplicitTls(smtp),
    auth: smtp.username && smtp.password ? { user: smtp.username, pass: smtp.password } : undefined,
    tls: smtp.useTls ? { rejectUnauthorized: false } : undefined,
  });

  await transporter.sendMail({ from: senderHeader(smtp), to, subject, text, html });
}

/**
 * Le message de bienvenue : relais résolu, message composé, envoi. Rend ce que
 * l'écran affiche — envoyé ou non, et pourquoi — sans jamais lever : le compte
 * et son rattachement existent déjà, l'appelant doit le savoir.
 */
async function sendWelcome(
  adminClient: SupabaseClient,
  env: Record<string, string | undefined>,
  args: { email: string; organizationId: string; apps: WelcomeApp[] },
): Promise<{ emailSent: boolean; emailError: string | null }> {
  try {
    // Relais applicable : celui de l'organisation, ou celui de l'ancêtre le
    // plus proche dont elle hérite (resolve_smtp_settings, service role) —
    // et, à défaut, le relais de plateforme.
    const { data: smtpRows, error: smtpError } = await adminClient.rpc("resolve_smtp_settings", {
      p_org_id: args.organizationId,
    });
    const row = (Array.isArray(smtpRows) ? smtpRows[0] : smtpRows) as SmtpRow | null;
    const smtp = resolveSmtp(smtpError ? null : row, env);
    if (!smtp) {
      throw new Error(
        "Aucun relais de messagerie : configurez le SMTP de l'organisation, ou le relais de plateforme.",
      );
    }

    const { data: org } = await adminClient
      .from("organizations")
      .select("name")
      .eq("id", args.organizationId)
      .single();
    const siteName = siteNameFor(org?.name, env);
    const message = welcomeMessage(siteName, args.apps);

    const html = renderBrandedEmail({
      primary: "#0aaa6b", // Edilumen primary green — matches src/index.css --primary
      siteName,
      heading: message.heading,
      bodyHtml: message.bodyHtml,
      action: message.action ?? undefined,
    });

    await sendViaSMTP(smtp, args.email, message.subject, html, message.text);
    // La SOURCE seule est journalisée (diagnostic), jamais les identifiants.
    console.log(`Bienvenue envoyée : org=${args.organizationId}, relais=${smtp.source}`);
    return { emailSent: true, emailError: null };
  } catch (err) {
    console.error("Failed to send welcome email:", err);
    return { emailSent: false, emailError: err instanceof Error ? err.message : "Erreur d'envoi de l'email" };
  }
}

/**
 * Abonnements et rôles des applications demandées (mêmes règles que la base :
 * trigger d'abonnement, clé étrangère du rôle, règle de la racine), vérifiés
 * AVANT de créer le compte. Rend le motif du refus.
 */
async function checkApplicationAccess(
  adminClient: SupabaseClient,
  rootId: string,
  request: AccessRequest,
): Promise<string | null> {
  if (request.applications.length === 0) return null;
  const ids = request.applications.map((a) => a.application_id);
  const [{ data: subscriptions }, { data: roles }] = await Promise.all([
    adminClient
      .from("organization_applications")
      .select("application_id")
      .eq("organization_id", rootId)
      .in("application_id", ids),
    adminClient.from("application_roles").select("application_id, code, is_admin").in("application_id", ids),
  ]);
  const subscribed = new Set((subscriptions ?? []).map((s: { application_id: string }) => s.application_id));
  return applicationAccessRefusal(request, rootId, subscribed, roles ?? []);
}

/**
 * Chaque organisme demandé : dans le périmètre de l'appelant (réévalué avec SON
 * jeton, la règle reste dans la base) ET dans la même collectivité que
 * l'organisme de la page — jamais d'agent à cheval sur deux collectivités.
 */
async function checkOrganizations(
  callerClient: SupabaseClient,
  adminClient: SupabaseClient,
  rootId: string,
  organizationIds: string[],
): Promise<boolean> {
  const checks = await Promise.all(
    organizationIds.map(async (id) => {
      const [{ data: allowed }, { data: root }] = await Promise.all([
        callerClient.rpc("is_admin_of_self_or_ancestor", { org_id: id }),
        adminClient.rpc("organization_root_id", { p_org_id: id }),
      ]);
      return allowed === true && root === rootId;
    }),
  );
  return checks.every(Boolean);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Non autorisé" });

    const env = Deno.env.toObject();
    const supabaseUrl = env.SUPABASE_URL!;
    const anonKey = env.SUPABASE_ANON_KEY!;
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY!;

    // Client scoped to the caller's own JWT — used only to re-evaluate the
    // RLS helper as *them*, so authorization logic lives in exactly one place
    // (the database), not duplicated here.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser } } = await callerClient.auth.getUser();
    if (!callerUser) return json(401, { error: "Non autorisé" });

    const body = await req.json();
    const action: string = body.action === "resend" ? "resend" : "create";
    const email: string | undefined = typeof body.email === "string" ? body.email.trim() : undefined;
    const organization_id: string | undefined = body.organization_id;

    if (!email || !organization_id) {
      return json(400, { error: "Champs obligatoires manquants" });
    }

    const { data: allowed, error: rpcError } = await callerClient.rpc("is_admin_of_self_or_ancestor", {
      org_id: organization_id,
    });
    if (rpcError || !allowed) {
      return json(403, { error: "Vous devez être administrateur de cette organisation." });
    }

    // From here on, use the service role — creating an auth user and
    // inserting into user_organizations for someone else is inherently
    // outside what the caller's own RLS grants would allow.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Le compte existant se cherche dans `public.users` (une ligne par compte,
    // posée par le trigger `on_auth_user_created`, e-mail unique et en
    // minuscules comme dans Supabase Auth) — `listUsers` paginait à 1 000.
    const { data: existingRow } = await adminClient
      .from("users")
      .select("id")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    const existingAuthUser = existingRow
      ? (await adminClient.auth.admin.getUserById(existingRow.id)).data.user
      : null;

    // --- Renvoi d'une invitation -------------------------------------------
    if (action === "resend") {
      if (!existingAuthUser) return json(404, { error: "Aucun compte pour cette adresse." });

      // Un accès (Socle ou application) sur un organisme que l'appelant gère.
      const [{ data: memberships }, { data: accesses }] = await Promise.all([
        adminClient.from("user_organizations").select("organization_id").eq("user_id", existingAuthUser.id),
        adminClient
          .from("user_application_access")
          .select("organization_id, application_id")
          .eq("user_id", existingAuthUser.id)
          .eq("is_active", true),
      ]);
      const isManaged = async (orgId: string) =>
        (await callerClient.rpc("is_admin_of_self_or_ancestor", { org_id: orgId })).data === true;
      const socleManaged = (await Promise.all((memberships ?? []).map((m: { organization_id: string }) => isManaged(m.organization_id)))).some(Boolean);
      const appRows = (accesses ?? []) as { organization_id: string; application_id: string }[];
      const managedApps = (
        await Promise.all(appRows.map(async (a) => ((await isManaged(a.organization_id)) ? a.application_id : null)))
      ).filter((id): id is string => id !== null);
      // Hors du périmètre de l'appelant = introuvable : on ne renseigne pas sur
      // les comptes des autres.
      if (!socleManaged && managedApps.length === 0) {
        return json(404, { error: "Aucun compte pour cette adresse." });
      }

      const sent = await sendWelcome(adminClient, env, {
        email,
        organizationId: organization_id,
        apps: welcomeApps(socleManaged, managedApps),
      });
      return json(200, {
        success: true,
        user_id: existingAuthUser.id,
        is_new_user: false,
        email_sent: sent.emailSent,
        email_error: sent.emailError,
      });
    }

    // --- Création et rattachement ------------------------------------------
    // `role` : accès au Socle (`admin` / `consultant`), ou vide — l'agent
    // n'utilise alors que d'autres applications. `applications` : ses accès à
    // celles-ci, avec le rôle de base que chacune déclare (`application_roles`).
    // Organismes : `socle_organization_ids` et `applications[].organization_ids`,
    // l'organisme de la page par défaut.
    const { first_name, last_name } = body;
    const request = parseAccessRequest(body, organization_id);
    if (!first_name || !last_name || request === null) {
      return json(400, { error: "Champs obligatoires manquants" });
    }
    const role = request.socleRole;
    if (!role && request.applications.length === 0) {
      return json(400, { error: "Ouvrez l'accès à au moins une application." });
    }

    // Tout se vérifie AVANT d'écrire : un accès refusé ne doit pas laisser un
    // compte créé sans rattachement.
    const { data: rootId } = await adminClient.rpc("organization_root_id", { p_org_id: organization_id });
    if (!rootId) return json(400, { error: "Organisation introuvable." });
    const organizationIds = requestedOrganizationIds(request);
    if (!(await checkOrganizations(callerClient, adminClient, rootId, organizationIds))) {
      return json(403, { error: "Un des organismes choisis est hors de votre périmètre." });
    }
    const refusal = await checkApplicationAccess(adminClient, rootId, request);
    if (refusal) return json(400, { error: refusal });

    let authUserId: string;
    let isNewUser = false;

    if (existingAuthUser) {
      authUserId = existingAuthUser.id;

      const [{ data: links }, { data: accesses }, { data: account }] = await Promise.all([
        adminClient.from("user_organizations").select("organization_id").eq("user_id", authUserId),
        adminClient.from("user_application_access").select("organization_id").eq("user_id", authUserId),
        adminClient.from("users").select("global_role").eq("id", authUserId).maybeSingle(),
      ]);
      const attached = [...(links ?? []), ...(accesses ?? [])].map((r: { organization_id: string }) => r.organization_id);

      if (attached.some((id) => organizationIds.includes(id))) {
        return json(409, {
          error: "Cet utilisateur est déjà rattaché à cette organisation : modifiez ses accès depuis la liste.",
        });
      }
      // Un agent relève d'une seule collectivité (le super admin seul fait
      // exception) : un compte rattaché ailleurs ne s'ajoute pas ici.
      if (account?.global_role !== "super_admin" && attached.length > 0) {
        const roots = await Promise.all(
          [...new Set(attached)].map(async (id) => (await adminClient.rpc("organization_root_id", { p_org_id: id })).data),
        );
        if (roots.some((r) => r !== rootId)) {
          return json(409, { error: "Ce compte est rattaché à une autre collectivité." });
        }
      }
    } else {
      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: false,
        user_metadata: { first_name, last_name },
      });

      if (createError) return json(400, { error: createError.message });

      authUserId = createData.user.id;
      isNewUser = true;
      // Our on_auth_user_created trigger already inserted a matching
      // public.users row (id, email, global_role) — we just fill in the names below.
    }

    const { error: nameError } = await adminClient
      .from("users")
      .update({ first_name, last_name })
      .eq("id", authUserId);
    if (nameError) return json(500, { error: nameError.message });

    if (request.applications.length > 0) {
      const { error: accessError } = await adminClient
        .from("user_application_access")
        .insert(accessRows(request, authUserId, rootId, callerUser.id));
      if (accessError) return json(500, { error: accessError.message });
    }

    if (role) {
      const { error: linkError } = await adminClient
        .from("user_organizations")
        .insert(request.socleOrganizationIds.map((id) => ({ organization_id: id, user_id: authUserId, role })));
      if (linkError) return json(500, { error: linkError.message });
    }

    // Le seul message de la gamme pour un nouvel agent (connexion unique) :
    // envoyé qu'il ait ou non un accès au Socle.
    let emailSent = false;
    let emailError: string | null = null;
    if (isNewUser) {
      const sent = await sendWelcome(adminClient, env, {
        email,
        organizationId: organization_id,
        apps: welcomeApps(Boolean(role), request.applications.map((a) => a.application_id)),
      });
      emailSent = sent.emailSent;
      emailError = sent.emailError;
    }

    return json(200, {
      success: true,
      user_id: authUserId,
      is_new_user: isNewUser,
      email_sent: emailSent,
      email_error: emailError,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return json(500, { error: "Erreur interne du serveur" });
  }
});
