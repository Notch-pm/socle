import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SmtpSettings {
  host: string;
  port: number;
  username: string;
  password: string;
  from_email: string;
  from_name: string;
  use_tls: boolean;
}

function buildBrandedEmail(siteName: string, heading: string, bodyHtml: string, ctaLabel: string, ctaUrl: string) {
  const primary = "#0aaa6b"; // Edilumen primary green — matches src/index.css --primary

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
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr><td style="background-color:${primary};border-radius:8px;">
              <a href="${ctaUrl}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">${ctaLabel}</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 32px 28px;">
          <p style="margin:20px 0 0;font-size:12px;color:#a1a1aa;word-break:break-all;">Si le bouton ne fonctionne pas, copiez ce lien : ${ctaUrl}</p>
          <hr style="border:none;border-top:1px solid #e4e4e7;margin:20px 0;" />
          <p style="margin:0;font-size:12px;color:#a1a1aa;text-align:center;">${siteName}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendViaSMTP(smtp: SmtpSettings, to: string, subject: string, html: string, text: string) {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port || 587,
    secure: smtp.use_tls && smtp.port === 465,
    auth: { user: smtp.username, pass: smtp.password },
    tls: smtp.use_tls ? { rejectUnauthorized: false } : undefined,
  });

  await transporter.sendMail({
    from: smtp.from_name ? `${smtp.from_name} <${smtp.from_email}>` : smtp.from_email,
    to,
    subject,
    text,
    html,
  });
}

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client scoped to the caller's own JWT — used only to re-evaluate our
    // existing is_org_admin() RLS helper as *them*, so authorization logic
    // lives in exactly one place (the database), not duplicated here.
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

    const body = await req.json();
    const { email, first_name, last_name, role, organization_id } = body;

    if (!email || !first_name || !last_name || !role || !organization_id) {
      return new Response(JSON.stringify({ error: "Champs obligatoires manquants" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: allowed, error: rpcError } = await callerClient.rpc("is_org_admin", {
      org_id: organization_id,
    });
    if (rpcError || !allowed) {
      return new Response(
        JSON.stringify({ error: "Vous devez être administrateur de cette organisation." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // From here on, use the service role — creating an auth user and
    // inserting into user_organizations for someone else is inherently
    // outside what the caller's own RLS grants would allow.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );

    let authUserId: string;
    let isNewUser = false;

    if (existingAuthUser) {
      authUserId = existingAuthUser.id;

      const { data: existingLink } = await adminClient
        .from("user_organizations")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("user_id", authUserId)
        .maybeSingle();

      if (existingLink) {
        return new Response(
          JSON.stringify({ error: "Cet utilisateur est déjà membre de cette organisation." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else {
      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: false,
        user_metadata: { first_name, last_name },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      authUserId = createData.user.id;
      isNewUser = true;
      // Our on_auth_user_created trigger already inserted a matching
      // public.users row (id, email, global_role) — we just fill in the names below.
    }

    const { error: nameError } = await adminClient
      .from("users")
      .update({ first_name, last_name })
      .eq("id", authUserId);

    if (nameError) {
      return new Response(JSON.stringify({ error: nameError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: linkError } = await adminClient
      .from("user_organizations")
      .insert({ organization_id, user_id: authUserId, role });

    if (linkError) {
      return new Response(JSON.stringify({ error: linkError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let emailSent = false;
    let emailError: string | null = null;

    if (isNewUser) {
      try {
        const { data: smtp, error: smtpError } = await adminClient
          .from("smtp_settings")
          .select("*")
          .eq("organization_id", organization_id)
          .single();

        if (smtpError || !smtp) {
          throw new Error("Configuration SMTP introuvable pour cette organisation.");
        }

        const { data: org } = await adminClient
          .from("organizations")
          .select("name")
          .eq("id", organization_id)
          .single();

        const siteName = org?.name || "Edilumen";

        const origin = (req.headers.get("origin") || "").replace(/\/$/, "");
        const { data: linkData, error: genLinkError } = await adminClient.auth.admin.generateLink({
          type: "invite",
          email,
          options: { redirectTo: `${origin}/activer-compte` },
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

        await sendViaSMTP(smtp as SmtpSettings, email, subject, html, text);
        emailSent = true;
      } catch (err) {
        emailError = err instanceof Error ? err.message : "Erreur d'envoi de l'email";
        console.error("Failed to send invite email:", err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: authUserId,
        is_new_user: isNewUser,
        email_sent: emailSent,
        email_error: emailError,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Erreur interne du serveur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
