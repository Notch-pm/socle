import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { to, organization_id } = await req.json();
    if (!to || !organization_id) {
      return new Response(JSON.stringify({ error: "Paramètres manquants (to, organization_id)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to))) {
      return new Response(JSON.stringify({ error: "Adresse email invalide" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Reuse is_org_admin() as the caller, same as invite-user — one place
    // for the authorization rule, not duplicated here.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: callerUser } } = await callerClient.auth.getUser();
    if (!callerUser) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: allowed } = await callerClient.rpc("is_org_admin", { org_id: organization_id });
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: smtp, error: smtpError } = await adminClient
      .from("smtp_settings")
      .select("*")
      .eq("organization_id", organization_id)
      .single();

    if (smtpError || !smtp) {
      return new Response(JSON.stringify({ error: "Configuration SMTP introuvable pour cette organisation" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: org } = await adminClient
      .from("organizations")
      .select("name, email_sender_override, email_sender_name")
      .eq("id", organization_id)
      .single();

    const siteName = org?.name || "Edilumen";
    const primary = "#0aaa6b";

    // Nom d'expéditeur propre à l'organisation si activé, sinon celui du SMTP.
    const senderName =
      org?.email_sender_override && org?.email_sender_name
        ? org.email_sender_name
        : smtp.from_name;

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port || 587,
      secure: smtp.use_tls && smtp.port === 465,
      auth: { user: smtp.username, pass: smtp.password },
      tls: smtp.use_tls ? { rejectUnauthorized: false } : undefined,
    });

    await transporter.sendMail({
      from: senderName ? `${senderName} <${smtp.from_email}>` : smtp.from_email,
      to,
      subject: `Test SMTP — ${siteName}`,
      text: `Ceci est un email de test envoyé depuis ${siteName}.\n\nVotre configuration SMTP fonctionne correctement.`,
      html: `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:${primary};padding:24px 32px;text-align:center;">
          <h2 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${siteName}</h2>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#18181b;">Test SMTP réussi</h1>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#52525b;">Ceci est un email de test envoyé depuis <strong>${siteName}</strong>.</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#52525b;">Votre configuration SMTP fonctionne correctement.</p>
          <hr style="border:none;border-top:1px solid #e4e4e7;margin:20px 0;" />
          <p style="margin:0;font-size:12px;color:#a1a1aa;">Serveur : ${smtp.host}:${smtp.port} — TLS : ${smtp.use_tls ? "Oui" : "Non"}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-test-email error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erreur interne" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
