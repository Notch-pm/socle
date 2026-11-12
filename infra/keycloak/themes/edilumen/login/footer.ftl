<#-- Pied de la page de connexion Edilumen : rappelle que ce compte vaut pour toute la gamme. -->
<#macro content>
<footer class="edl-footer">
  <div>Un seul compte pour <strong>Socle</strong>, <strong>Iris</strong> et <strong>Clara</strong>.</div>
  <div>Besoin d'aide ? Contactez l'administrateur de votre collectivité.</div>
</footer>
<#-- Déconnexion unique : les applications de la gamme envoient l'agent vers la
     déconnexion Keycloak sans `id_token_hint` (Supabase ne le leur donne pas) ;
     Keycloak demande alors « Voulez-vous vous déconnecter ? ». L'agent vient de
     cliquer « Se déconnecter » dans l'application : on confirme pour lui. On
     clique le bouton (et non `form.submit()`) pour que `confirmLogout`, que
     Keycloak exige, parte avec le formulaire. Aucun gabarit réécrit. -->
<script>
  document.addEventListener("DOMContentLoaded", function () {
    var page = document.getElementById("kc-logout-confirm");
    var button = document.getElementById("kc-logout");
    if (page && button && button.form) button.click();
  });
</script>
</#macro>
