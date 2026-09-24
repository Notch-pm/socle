import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";
import { escapeHtml, renderBrandedEmail } from "./_shared/emailLayout.ts";

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

    // Autorisation evaluee comme l'appelant : is_admin_of_self_or_ancestor(),
    // pour qu'un admin d'organisation principale puisse tester le relais d'une
    // de ses sous-organisations (meme regle que le RLS de smtp_settings).
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
    const { data: allowed } = await callerClient.rpc("is_admin_of_self_or_ancestor", {
      org_id: organization_id,
    });
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Relais applicable : celui de l'organisation, ou celui de l'ancetre le plus
    // proche dont elle herite. La resolution vit en base (resolve_smtp_settings,
    // EXECUTE reserve au service role) pour ne pas etre reecrite par function.
    const { data: smtpRows, error: smtpError } = await adminClient.rpc("resolve_smtp_settings", {
      p_org_id: organization_id,
    });
    const smtp = Array.isArray(smtpRows) ? smtpRows[0] : smtpRows;

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
      html: renderBrandedEmail({
        primary,
        siteName,
        heading: "Test SMTP réussi",
        bodyHtml: `<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#52525b;">Ceci est un email de test envoyé depuis <strong>${escapeHtml(siteName)}</strong>.</p>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#52525b;">Votre configuration SMTP fonctionne correctement.</p>
          <p style="margin:0;font-size:12px;color:#a1a1aa;">Serveur : ${escapeHtml(`${smtp.host}:${smtp.port}`)} — TLS : ${smtp.use_tls ? "Oui" : "Non"}</p>`,
      }),
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
