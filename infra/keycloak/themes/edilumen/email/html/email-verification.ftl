<#import "template.ftl" as layout>
<@layout.emailLayout heading=msg("edlVerifyHeading") actionLabel=msg("edlVerifyAction") actionUrl=link footnote=msg("edlLinkExpiry", linkExpirationFormatter(linkExpiration))>
<@layout.p>${msg("edlVerifyIntro")}</@layout.p>
<@layout.p>${msg("edlVerifyIgnore")}</@layout.p>
</@layout.emailLayout>
