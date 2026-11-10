<#--
  Cadre des e-mails Keycloak — REPRISE de `renderBrandedEmail`
  (supabase/functions/invite-user/_shared/emailLayout.ts du Socle), même dessin
  que les e-mails d'Iris et de Clara :
    • colonne centrée de 520 px, fond blanc, bordée de 1 px de la couleur
      principale, arrondie aux quatre coins (16 px) ;
    • bandeau blanc (le nom « Edilumen » : pas d'image, beaucoup de messageries
      les bloquent), filet de la couleur principale ;
    • titre, corps, bouton plein, lien de repli cliquable, filet gris, pied.
  ⚠️ Outlook pour Windows ignore border-radius : la colonne y est dessinée en
  VML (commentaires conditionnels [if mso]). ⚠️ Styles inline et couleurs
  hexadécimales seulement (Gmail supprime les <style>).
  Les modèles appellent `emailLayout` avec heading / actionLabel / actionUrl /
  footnote ; ceux que ce thème ne réécrit pas (alertes de sécurité) l'appellent
  sans paramètre et gardent leur texte, dans le même cadre.
-->
<#macro p><p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#52525b;"><#nested></p></#macro>

<#macro emailLayout heading="" actionLabel="" actionUrl="" footnote="">
<#assign primary = "#089b59">
<#assign ink = "#18181b">
<#assign muted = "#a1a1aa">
<#assign rule = "#e4e4e7">
<#assign link = "#2563eb">
<#assign font = "Arial,Helvetica,sans-serif">
<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${heading}</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:${font};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" arcsize="3%" strokecolor="${primary}" strokeweight="1px" fillcolor="#ffffff" style="width:520px;v-text-anchor:top;"><v:textbox inset="0,0,0,0" style="mso-fit-shape-to-text:true"><table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:520px;"><![endif]-->
        <!--[if !mso]><!--><table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:520px;max-width:100%;border-collapse:separate;border-spacing:0;background-color:#ffffff;border:1px solid ${primary};border-radius:16px;"><!--<![endif]-->
          <tr>
            <td align="center" style="padding:28px 32px 24px;border-bottom:1px solid ${primary};border-radius:16px 16px 0 0;">
              <p style="margin:0;font-family:${font};font-size:20px;font-weight:700;line-height:1.3;color:${ink};">Edilumen</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 28px;font-family:${font};">
              <#if heading?has_content>
              <h1 style="margin:0 0 16px;font-family:${font};font-size:22px;line-height:1.3;font-weight:700;color:${ink};">${heading}</h1>
              </#if>
              <#nested>
              <#if actionUrl?has_content>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px auto 0;">
                <tr><td align="center" style="background-color:${primary};border-radius:8px;">
                  <a href="${actionUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 32px;font-family:${font};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">${actionLabel}</a>
                </td></tr>
              </table>
              </#if>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;font-family:${font};">
              <#if actionUrl?has_content>
              <p style="margin:0 0 20px;font-family:${font};font-size:12px;line-height:1.6;color:${muted};word-break:break-all;">Si le bouton ne fonctionne pas, copiez ce lien : <a href="${actionUrl}" target="_blank" rel="noopener" style="color:${link};text-decoration:underline;">${actionUrl}</a></p>
              </#if>
              <#if footnote?has_content>
              <p style="margin:0 0 20px;font-family:${font};font-size:12px;line-height:1.6;color:${muted};">${footnote}</p>
              </#if>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${rule};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>
              <p style="margin:16px 0 0;font-family:${font};font-size:12px;line-height:1.6;font-weight:700;color:${muted};text-align:center;">Edilumen — un seul compte pour Socle, Iris et Clara</p>
            </td>
          </tr>
        </table>
        <!--[if mso]></v:textbox></v:roundrect><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>
</#macro>
