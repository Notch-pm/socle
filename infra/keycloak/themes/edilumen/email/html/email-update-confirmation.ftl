<#import "template.ftl" as layout>
<@layout.emailLayout heading=msg("edlEmailUpdateHeading") actionLabel=msg("edlEmailUpdateAction") actionUrl=link footnote=msg("edlLinkExpiry", linkExpirationFormatter(linkExpiration))>
<@layout.p>${msg("edlEmailUpdateIntro", newEmail)}</@layout.p>
<@layout.p>${msg("edlEmailUpdateIgnore")}</@layout.p>
</@layout.emailLayout>
