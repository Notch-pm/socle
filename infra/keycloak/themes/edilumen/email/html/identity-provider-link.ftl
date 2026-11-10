<#import "template.ftl" as layout>
<@layout.emailLayout heading=msg("edlIdpLinkHeading") actionLabel=msg("edlIdpLinkAction") actionUrl=link footnote=msg("edlLinkExpiry", linkExpirationFormatter(linkExpiration))>
<@layout.p>${msg("edlIdpLinkIntro", identityProviderDisplayName)}</@layout.p>
<@layout.p>${msg("edlIdpLinkIgnore")}</@layout.p>
</@layout.emailLayout>
