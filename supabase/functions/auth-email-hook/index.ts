import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import nodemailer from "npm:nodemailer@6";
import {
  resolveSmtp,
  senderHeader,
  siteNameFor,
  useImplicitTls,
  type SmtpConfig,
  type SmtpRow,
} from "./_shared/smtp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature",
};

function buildBrandedEmail(siteName: string, heading: string, bodyHtml: string, ctaLabel: string, ctaUrl: string, isOtp = false) {
  const primary = "#0aaa6b"; // Edilumen primary green — matches src/index.css --primary
  const otpBg = "#f4f4f5";

  const ctaBlock = isOtp
    ? `<div style="text-align:center;padding:16px;background:${otpBg};border-radius:8px;font-size:28px;font-weight:700;letter-spacing:4px;color:#18181b;">${ctaUrl}</div>`
    : `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr><td style="background-color:${primary};border-radius:8px;">
          <a href="${ctaUrl}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">${ctaLabel}</a>
        </td></tr>
      </table>`;

  const fallbackLink = isOtp
    ? ""
    : `<p style="margin:20px 0 0;font-size:12px;color:#a1a1aa;word-break:break-all;">Si le bouton ne fonctionne pas, copiez ce lien : ${ctaUrl}</p>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:${primary};padding:24px 32px;text-align:center;">
          <h2 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${siteName}</h2>
        </td></tr>
        <tr><td style="padding:32px 32px 24px;">
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#18181b;">${heading}</h1>
          ${bodyHtml}
          ${ctaBlock}
        </td></tr>
        <tr><td style="padding:0 32px 28px;">
          ${fallbackLink}
          <hr style="border:none;border-top:1px solid #e4e4e7;margin:20px 0;" />
          <p style="margin:0;font-size:12px;color:#a1a1aa;text-align:center;">${siteName}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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

function getEmailContent(emailType: string, siteName: string) {
  const templates: Record<string, { subject: string; heading: string; body: string; cta: string }> = {
    recovery: {
      subject: `Réinitialisation de votre mot de passe — ${siteName}`,
      heading: "Réinitialisation de mot de passe",
      body: "Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.",
      cta: "Réinitialiser le mot de passe",
    },
    invite: {
      subject: `Activez votre compte — ${siteName}`,
      heading: "Bienvenue !",
      body: `Vous avez été invité(e) à rejoindre <strong>${siteName}</strong>. Cliquez sur le bouton ci-dessous pour définir votre mot de passe et activer votre compte.`,
      cta: "Activer mon compte",
    },
    signup: {
      subject: `Confirmez votre inscription — ${siteName}`,
      heading: "Confirmation d'inscription",
      body: "Merci de vous être inscrit(e). Veuillez confirmer votre adresse e-mail en cliquant sur le bouton ci-dessous.",
      cta: "Confirmer mon adresse e-mail",
    },
    magiclink: {
      subject: `Votre lien de connexion — ${siteName}`,
      heading: "Connexion par lien magique",
      body: "Cliquez sur le bouton ci-dessous pour vous connecter à votre compte.",
      cta: "Se connecter",
    },
    email_change: {
      subject: `Confirmation de changement d'e-mail — ${siteName}`,
      heading: "Changement d'adresse e-mail",
      body: "Vous avez demandé à changer votre adresse e-mail. Cliquez sur le bouton ci-dessous pour confirmer ce changement.",
      cta: "Confirmer le changement",
    },
    reauthentication: {
      subject: `Code de vérification — ${siteName}`,
      heading: "Code de vérification",
      body: "Voici votre code de vérification pour confirmer votre identité.",
      cta: "",
    },
  };

  return templates[emailType] || templates.recovery;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify Supabase Auth "Send Email" hook signature (Standard Webhooks).
    // The secret is generated by Supabase Dashboard → Authentication → Hooks
    // → Send Email hook, and must be stored as the AUTH_HOOK_SECRET function
    // secret. Supabase's value starts with "v1,whsec_..." — the standardwebhooks
    // library only wants the base64 portion, hence the prefix strip below.
    const rawSecret = Deno.env.get("AUTH_HOOK_SECRET");
    if (!rawSecret) {
      console.error("AUTH_HOOK_SECRET not configured");
      return new Response(JSON.stringify({ error: "Hook not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const hookSecret = rawSecret.replace(/^v1,whsec_/, "");

    const rawBody = await req.text();
    const wh = new Webhook(hookSecret);
    let payload: { user: { id: string; email: string }; email_data: Record<string, string> };
    try {
      payload = wh.verify(rawBody, {
        "webhook-id": req.headers.get("webhook-id") ?? "",
        "webhook-timestamp": req.headers.get("webhook-timestamp") ?? "",
        "webhook-signature": req.headers.get("webhook-signature") ?? "",
      }) as typeof payload;
    } catch (verifyErr) {
      console.error("Signature verification failed:", verifyErr);
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const env = Deno.env.toObject();
    const supabaseUrl = env.SUPABASE_URL!;
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const user = payload.user;
    const emailData = payload.email_data;

    if (!user?.email || !emailData) {
      return new Response(JSON.stringify({ error: "Payload invalide" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // L'organisation de l'utilisateur (première appartenance) donne le nom
    // sous lequel le courriel se présente et le relais à utiliser. Un compte
    // SANS appartenance — le super administrateur de la plateforme, un compte
    // pas encore rattaché — n'a pas d'organisation : il est servi par le relais
    // de plateforme, au nom de la plateforme.
    const { data: membership } = await adminClient
      .from("user_organizations")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    const orgId: string | null = membership?.organization_id ?? null;

    let orgName: string | null = null;
    let row: SmtpRow | null = null;
    if (orgId) {
      const { data: org } = await adminClient
        .from("organizations")
        .select("name")
        .eq("id", orgId)
        .single();
      orgName = org?.name ?? null;

      // Relais applicable : celui de l'organisation de l'utilisateur, ou celui
      // de l'ancêtre le plus proche dont elle hérite (resolve_smtp_settings).
      const { data: smtpRows, error: smtpError } = await adminClient.rpc("resolve_smtp_settings", {
        p_org_id: orgId,
      });
      row = smtpError ? null : ((Array.isArray(smtpRows) ? smtpRows[0] : smtpRows) as SmtpRow | null);
    }

    // La collectivité d'abord, le relais de plateforme en repli — voir
    // _shared/smtp.ts. Sans l'un ni l'autre, on le dit : un courriel
    // d'authentification qui ne part pas est une panne, pas un détail.
    const smtp = resolveSmtp(row, env);
    if (!smtp) {
      console.error(orgId ? `No SMTP settings for org ${orgId}, no platform relay` : `No organization for user ${user.id}, no platform relay`);
      return new Response(
        JSON.stringify({
          error: orgId
            ? "Configuration SMTP introuvable pour cette organisation, et aucun relais de plateforme configuré"
            : "Organisation introuvable pour cet utilisateur, et aucun relais de plateforme configuré",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const siteName = siteNameFor(orgName, env);

    const emailType = emailData.email_action_type || "recovery";
    const tokenHash = emailData.token_hash || "";
    const token = emailData.token || "";
    const redirectTo = emailData.redirect_to || "";

    let confirmationUrl: string;
    if (emailType === "reauthentication") {
      confirmationUrl = token;
    } else {
      confirmationUrl = `${supabaseUrl}/auth/v1/verify?token=${tokenHash}&type=${emailType}&redirect_to=${encodeURIComponent(redirectTo)}`;
    }

    const t = getEmailContent(emailType, siteName);
    const isOtp = emailType === "reauthentication";
    const bodyHtml = `<p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#52525b;">${t.body}</p>`;

    const html = buildBrandedEmail(siteName, t.heading, bodyHtml, t.cta, confirmationUrl, isOtp);
    const text = isOtp
      ? `${t.heading}\n\n${t.body}\n\nCode : ${confirmationUrl}\n\n${siteName}`
      : `${t.heading}\n\n${t.body}\n\n${t.cta} : ${confirmationUrl}\n\n${siteName}`;

    await sendViaSMTP(smtp, user.email, t.subject, html, text);
    console.log(`Auth email sent: type=${emailType}, to=${user.email}, org=${orgId ?? "none"}, relay=${smtp.source}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("auth-email-hook error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erreur interne" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
