<#outputformat "plainText">
<#assign requiredActionsText><#if requiredActions??><#list requiredActions><#items as reqActionItem>${msg("requiredAction.${reqActionItem}")}<#sep>, </#sep></#items></#list></#if></#assign>
</#outputformat>
<#import "template.ftl" as layout>
<@layout.emailLayout heading=msg("edlActionsHeading") actionLabel=msg("edlActionsAction") actionUrl=link footnote=msg("edlLinkExpiry", linkExpirationFormatter(linkExpiration))>
<@layout.p>${msg("edlActionsIntro", requiredActionsText)}</@layout.p>
<@layout.p>${msg("edlActionsIgnore")}</@layout.p>
</@layout.emailLayout>
