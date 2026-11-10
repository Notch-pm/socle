<#import "template.ftl" as layout>
<@layout.emailLayout heading=msg("edlResetHeading") actionLabel=msg("edlResetAction") actionUrl=link footnote=msg("edlLinkExpiry", linkExpirationFormatter(linkExpiration))>
<@layout.p>${msg("edlResetIntro")}</@layout.p>
<@layout.p>${msg("edlResetIgnore")}</@layout.p>
</@layout.emailLayout>
