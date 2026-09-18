# Feature : mise en service d'un client (provisioning, check-list, plateforme)

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

Procédure complète : [docs/onboarding.md](../onboarding.md). **La règle** : par client, rien
dans Supabase — tout dans le Socle ; dans Supabase, une fois, pour la plateforme.

- **Réglages de plateforme** (`platform_settings`, ligne unique, page `/superadmin/plateforme`,
  `src/features/superadmin/platform/`) : zone des sous-domaines fournis, cible CNAME des domaines
  personnalisés, plafond IA par défaut. Lisible par tout `authenticated` (aucun secret n'y vit —
  l'écran des domaines affiche la cible CNAME), UPDATE super admin. Bouton **« Rejouer le
  provisioning »** (`provision_existing_roots`) pour les racines créées avant les réglages.
- **Une racine naît équipée** : trigger `provision_root_organization` (AFTER INSERT OR UPDATE OF
  `parent_id`, racines seulement) → `provision_root` pose les **8 rôles de contact** (le seed du
  2026-07-15 ne se rejouait jamais : `contacts-api` refusait tout rôle à un client récent), le
  **plafond IA par défaut** (insert direct dans `ai_usage_quotas` — `set_ai_usage_quota` exige
  `auth.uid()`, nul dans un trigger) et le **sous-domaine fourni** `<slug>.<zone>`.
  ⚠️ **Idempotent et jamais bloquant** : `on conflict do nothing`, collision de hostname →
  `raise warning`, et le trigger avale toute erreur (`exception when others`) — la création de
  l'organisation est l'acte principal. ⚠️ Tout script qui insère des racines en hérite :
  `plafond-ia.test.sql` neutralise le plafond par défaut en tête de transaction.
  ⚠️ Le **slug n'est pas sûr pour un nom DNS** (« Sète » → `s-te` par l'ancien `slugify`) :
  `dns_label_from_slug` (SQL) / `dnsLabelFromSlug` (TS, `organizationDomains.ts`, tests jumeaux)
  dérivent le label — et `OrganizationFormDialog` slugifie désormais avec lui. Un slug renommé
  ensuite **ne renomme pas** le sous-domaine.
- **Check-list « Mise en service »** en tête de la page d'une racine (`OnboardingChecklistCard`,
  logique pure `onboardingChecklist.ts`, RPC `root_onboarding_status` — `jsonb`, pour qu'une
  clé s'ajoute sans `drop function`) : SMTP, premier admin, applications souscrites, catégories,
  démarche en production, activation, domaine, page publiée (facultatif), plafond IA décidé, logo
  (facultatif), rôles. Chaque ligne mène à sa section (`?section=`). ⚠️ Lecteur **tolérant** :
  une clé absente vaut « pas fait », jamais une exception.
- **Le super administrateur peut tout faire** depuis `OrgSettingsPage` : sections
  `categories` (`CategoriesManager`, motif `DocumentTypesManager`), `activations`
  (`ActivationsSection` = sélecteur sur le sous-arbre + `OrganizationProceduresTab`), et
  `GeneralInfoSection` monte le `GeneralInfoForm` complet de l'app par organisation (adresse,
  téléphone, courriel, expéditeur). Avant, `ProtectedRoute` le redirigeait hors des deux écrans
  qui créent une catégorie et activent une démarche : un client ne se livrait pas sans SQL.
- **Plafond IA : « illimité » est une décision.** Ligne absente = non décidé (la check-list le
  signale) ; ligne `is_active = false` = illimité **explicite**, valeur conservée pour le retour
  en arrière (`AiUsageSection` : « Passer en illimité », `useAiUsage` expose `configuredLimit`).
- **Courriels d'authentification en repli de plateforme** (`PLATFORM_SMTP_*`, module pur
  `_shared/smtp.ts` **identique** dans `invite-user` et `auth-email-hook`, test d'identité) :
  la collectivité d'abord (`resolve_smtp_settings`), la plateforme ensuite, rien sinon. Couvre
  l'invitation du premier administrateur avant tout SMTP, et le super admin sans organisation.
  ⚠️ Les courriels **métier** ne connaissent pas ce repli. `invite-user` : garde
  `is_admin_of_self_or_ancestor` (motif `send-test-email`), action `resend` (bouton
  « Renvoyer l'invitation », 409 si le compte est déjà actif).
- Tests SQL auto-annulés : `supabase/tests/provisioning.test.sql`, `applications.test.sql`.
  Migrations : `platform_settings`, `provision_root_organization`, `root_onboarding_status`,
  `organization_domains_superadmin_write`.
