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

// Invitation d'un utilisateur dans une organisation, et renvoi d'une
// invitation restée sans suite.
//
// Deux actions sur le même corps JSON :
//   • (défaut) créer le compte s'il n'existe pas, le rattacher, envoyer
//     l'invitation ;
//   • `action: "resend"` — réémettre le lien d'activation d'un compte encore
//     inactif. Avant ce bouton, un courriel perdu (relais absent au moment de
//     l'invitation, boîte pleine) laissait un compte créé que personne ne
//     pouvait activer, et « mot de passe oublié » passait par le même relais.
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

function buildBrandedEmail(siteName: string, heading: string, bodyHtml: string, ctaLabel: string, ctaUrl: string) {
  return renderBrandedEmail({
    primary: "#0aaa6b", // Edilumen primary green — matches src/index.css --primary
    siteName,
    heading,
    bodyHtml,
    action: { label: ctaLabel, url: ctaUrl },
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
 * Le courriel d'invitation : relais résolu, lien d'activation, envoi. Rend ce
 * que l'écran affiche — envoyé ou non, et pourquoi — sans jamais lever : le
 * compte et son rattachement existent déjà, l'appelant doit le savoir.
 */
async function sendInvitation(
  adminClient: SupabaseClient,
  env: Record<string, string | undefined>,
  args: { email: string; organizationId: string; origin: string },
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

    const { data: linkData, error: genLinkError } = await adminClient.auth.admin.generateLink({
      type: "invite",
      email: args.email,
      options: { redirectTo: `${args.origin}/activer-compte` },
    });
    if (genLinkError || !linkData?.properties?.action_link) {
      throw new Error(genLinkError?.message || "Impossible de générer le lien d'invitation");
    }

    const confirmationUrl = linkData.properties.action_link;
    const subject = `Activez votre compte — ${siteName}`;
    const heading = "Bienvenue !";
    const bodyText = `Vous avez été invité(e) à rejoindre <strong>${siteName}</strong>. Cliquez sur le bouton ci-dessous pour définir votre mot de passe et activer votre compte.`;
    const bodyHtml = `<p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#52525b;">${bodyText}</p>`;

    const html = buildBrandedEmail(siteName, heading, bodyHtml, "Activer mon compte", confirmationUrl);
    const text = `${heading}\n\n${bodyText.replace(/<[^>]+>/g, "")}\n\nActiver mon compte : ${confirmationUrl}\n\n${siteName}`;

    await sendViaSMTP(smtp, args.email, subject, html, text);
    // La SOURCE seule est journalisée (diagnostic), jamais les identifiants.
    console.log(`Invitation envoyée : org=${args.organizationId}, relais=${smtp.source}`);
    return { emailSent: true, emailError: null };
  } catch (err) {
    console.error("Failed to send invite email:", err);
    return { emailSent: false, emailError: err instanceof Error ? err.message : "Erreur d'envoi de l'email" };
  }
}

interface ApplicationAccessInput {
  application_id: string;
  role_code: string;
}

/** `applications` du corps : absent = aucun ; mal formé = `null` (400). */
function parseApplicationAccess(value: unknown): ApplicationAccessInput[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 20) return null;
  const seen = new Set<string>();
  const out: ApplicationAccessInput[] = [];
  for (const item of value) {
    const applicationId = (item as Record<string, unknown>)?.application_id;
    const roleCode = (item as Record<string, unknown>)?.role_code;
    if (typeof applicationId !== "string" || typeof roleCode !== "string" || !applicationId || !roleCode) {
      return null;
    }
    if (seen.has(applicationId)) return null;
    seen.add(applicationId);
    out.push({ application_id: applicationId, role_code: roleCode });
  }
  return out;
}

/**
 * Chaque accès demandé : application abonnée par la racine de l'organisme, et
 * rôle qu'elle déclare. Les mêmes règles que la base (trigger
 * `enforce_user_application_access_subscription`, clé étrangère du rôle),
 * vérifiées ici pour refuser AVANT de créer le compte. Rend le motif du refus.
 */
async function checkApplicationAccess(
  adminClient: SupabaseClient,
  organizationId: string,
  access: ApplicationAccessInput[],
): Promise<string | null> {
  const { data: rootId } = await adminClient.rpc("organization_root_id", { p_org_id: organizationId });
  if (!rootId) return "Organisation introuvable.";
  const ids = access.map((a) => a.application_id);
  const [{ data: subscriptions }, { data: roles }] = await Promise.all([
    adminClient
      .from("organization_applications")
      .select("application_id")
      .eq("organization_id", rootId)
      .in("application_id", ids),
    adminClient.from("application_roles").select("application_id, code").in("application_id", ids),
  ]);
  const subscribed = new Set((subscriptions ?? []).map((s: { application_id: string }) => s.application_id));
  for (const a of access) {
    if (!subscribed.has(a.application_id)) {
      return `La collectivité n'est pas abonnée à l'application « ${a.application_id} ».`;
    }
    const known = (roles ?? []).some(
      (r: { application_id: string; code: string }) => r.application_id === a.application_id && r.code === a.role_code,
    );
    if (!known) return `Rôle inconnu pour l'application « ${a.application_id} ».`;
  }
  return null;
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
    const origin = (req.headers.get("origin") || "").replace(/\/$/, "");

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

      const { data: membership } = await adminClient
        .from("user_organizations")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("user_id", existingAuthUser.id)
        .maybeSingle();
      // Hors de l'organisation de l'appelant = introuvable : on ne renseigne
      // pas sur les comptes des autres.
      if (!membership) return json(404, { error: "Aucun compte pour cette adresse." });

      if (existingAuthUser.email_confirmed_at) {
        return json(409, {
          error: "Ce compte est déjà actif : la personne peut se connecter, ou demander un nouveau mot de passe.",
        });
      }

      const sent = await sendInvitation(adminClient, env, { email, organizationId: organization_id, origin });
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
    const { first_name, last_name } = body;
    const role: string = typeof body.role === "string" ? body.role : "";
    const appAccess = parseApplicationAccess(body.applications);
    if (!first_name || !last_name || appAccess === null || !["", "admin", "consultant"].includes(role)) {
      return json(400, { error: "Champs obligatoires manquants" });
    }
    if (!role && appAccess.length === 0) {
      return json(400, { error: "Ouvrez l'accès à au moins une application." });
    }

    // Tout se vérifie AVANT d'écrire : un accès refusé ne doit pas laisser un
    // compte créé sans rattachement.
    if (appAccess.length > 0) {
      const refusal = await checkApplicationAccess(adminClient, organization_id, appAccess);
      if (refusal) return json(400, { error: refusal });
    }

    let authUserId: string;
    let isNewUser = false;

    if (existingAuthUser) {
      authUserId = existingAuthUser.id;

      const [{ data: existingLink }, { data: existingAccess }] = await Promise.all([
        adminClient
          .from("user_organizations")
          .select("id")
          .eq("organization_id", organization_id)
          .eq("user_id", authUserId)
          .maybeSingle(),
        adminClient
          .from("user_application_access")
          .select("id")
          .eq("organization_id", organization_id)
          .eq("user_id", authUserId)
          .limit(1),
      ]);

      if (existingLink || existingAccess?.length) {
        return json(409, {
          error: "Cet utilisateur est déjà rattaché à cette organisation : modifiez ses accès depuis la liste.",
        });
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

    if (appAccess.length > 0) {
      const { error: accessError } = await adminClient.from("user_application_access").insert(
        appAccess.map((a) => ({
          user_id: authUserId,
          organization_id,
          application_id: a.application_id,
          role_code: a.role_code,
          created_by: callerUser.id,
        })),
      );
      if (accessError) return json(500, { error: accessError.message });
    }

    if (role) {
      const { error: linkError } = await adminClient
        .from("user_organizations")
        .insert({ organization_id, user_id: authUserId, role });
      if (linkError) return json(500, { error: linkError.message });
    }

    // L'invitation du Socle sert à choisir un mot de passe POUR LE SOCLE : sans
    // accès au Socle, rien à envoyer (chaque application invite ses agents
    // tant que la connexion unique n'est pas en place).
    let emailSent = false;
    let emailError: string | null = null;
    if (isNewUser && role) {
      const sent = await sendInvitation(adminClient, env, { email, organizationId: organization_id, origin });
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
