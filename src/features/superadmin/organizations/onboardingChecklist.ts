/**
 * Check-list de mise en service d'une organisation principale — logique pure,
 * testée. La lecture vient de la RPC `root_onboarding_status` (une seule
 * définition de « prêt », côté base) ; ce module la traduit en lignes qu'un
 * super administrateur déroule, chacune menant à la section qui la règle.
 *
 * ⚠️ Un lecteur tolérant : la RPC rend du JSON et gagnera des clés (les
 * applications souscrites, au lot suivant). Une clé absente vaut « pas fait »
 * ou zéro, jamais une exception — la page d'une collectivité ne doit pas
 * tomber parce que la base a une version d'avance ou de retard.
 */

export interface RootOnboardingStatus {
  smtp_configured: boolean;
  admin_count: number;
  category_count: number;
  procedure_count: number;
  procedure_production_count: number;
  activation_count: number;
  domain_count: number;
  portal_published: boolean;
  ai_quota_decided: boolean;
  ai_quota_active: boolean;
  logo_present: boolean;
  contact_role_count: number;
  /** Absent tant que le registre des applications n'existe pas. */
  application_count: number | null;
}

export function parseOnboardingStatus(value: unknown): RootOnboardingStatus {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const flag = (key: string) => record[key] === true;
  const count = (key: string) => {
    const raw = record[key];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  };
  return {
    smtp_configured: flag("smtp_configured"),
    admin_count: count("admin_count"),
    category_count: count("category_count"),
    procedure_count: count("procedure_count"),
    procedure_production_count: count("procedure_production_count"),
    activation_count: count("activation_count"),
    domain_count: count("domain_count"),
    portal_published: flag("portal_published"),
    ai_quota_decided: flag("ai_quota_decided"),
    ai_quota_active: flag("ai_quota_active"),
    logo_present: flag("logo_present"),
    contact_role_count: count("contact_role_count"),
    application_count:
      typeof record.application_count === "number" ? (record.application_count as number) : null,
  };
}

/** Où mène une ligne : une section de la page, l'éditeur du site, ou nulle part. */
export type ChecklistTarget = { kind: "section"; section: string } | { kind: "portal" } | null;

export interface ChecklistItem {
  key: string;
  label: string;
  /** Ce qu'il en est aujourd'hui, ou pourquoi ça compte. */
  detail: string;
  done: boolean;
  /** Facultatif : ne compte pas dans la progression, reste affiché. */
  optional: boolean;
  target: ChecklistTarget;
}

const section = (name: string): ChecklistTarget => ({ kind: "section", section: name });

/**
 * Les lignes, dans l'ordre où l'on s'en occupe. Le relais de messagerie vient
 * en premier : c'est lui qui porte les courriels de la collectivité.
 */
export function buildChecklist(status: RootOnboardingStatus): ChecklistItem[] {
  const items: ChecklistItem[] = [
    {
      key: "smtp",
      label: "Relais de messagerie (SMTP)",
      detail: status.smtp_configured
        ? "Les courriels de la collectivité partent par son relais."
        : "Sans relais propre, seuls les courriels d'authentification partent, par le relais de la plateforme.",
      done: status.smtp_configured,
      optional: false,
      target: section("smtp"),
    },
    {
      key: "admin",
      label: "Un administrateur invité",
      detail:
        status.admin_count > 0
          ? `${status.admin_count} administrateur${status.admin_count > 1 ? "s" : ""}.`
          : "Personne ne peut encore paramétrer la collectivité de son côté.",
      done: status.admin_count > 0,
      optional: false,
      target: section("utilisateurs"),
    },
  ];

  if (status.application_count !== null) {
    items.push({
      key: "applications",
      label: "Applications souscrites",
      detail:
        status.application_count > 0
          ? `${status.application_count} application${status.application_count > 1 ? "s" : ""} de la gamme.`
          : "Aucune application ne voit encore cette collectivité — ni le portail, ni Iris, ni Clara.",
      done: status.application_count > 0,
      optional: false,
      target: section("applications"),
    });
  }

  items.push(
    {
      key: "categories",
      label: "Au moins une catégorie",
      detail:
        status.category_count > 0
          ? `${status.category_count} catégorie${status.category_count > 1 ? "s" : ""}.`
          : "Une démarche ne se crée pas sans catégorie.",
      done: status.category_count > 0,
      optional: false,
      target: section("categories"),
    },
    {
      key: "procedures",
      label: "Une démarche en production",
      detail:
        status.procedure_production_count > 0
          ? `${status.procedure_production_count} en production sur ${status.procedure_count}.`
          : status.procedure_count > 0
            ? `${status.procedure_count} démarche${status.procedure_count > 1 ? "s" : ""}, toutes en brouillon : rien n'est proposé.`
            : "Aucune démarche paramétrée.",
      done: status.procedure_production_count > 0,
      optional: false,
      target: section("demarches"),
    },
    {
      key: "activations",
      label: "Une démarche activée par un organisme",
      detail:
        status.activation_count > 0
          ? `${status.activation_count} activation${status.activation_count > 1 ? "s" : ""} dans l'arbre.`
          : "Une démarche que personne n'active n'est servie par aucun portail, même en production.",
      done: status.activation_count > 0,
      optional: false,
      target: section("activations"),
    },
    {
      key: "domain",
      label: "Un domaine pour le portail",
      detail:
        status.domain_count > 0
          ? `${status.domain_count} domaine${status.domain_count > 1 ? "s" : ""}.`
          : "Le sous-domaine fourni se pose à la création quand la plateforme a une zone réglée.",
      done: status.domain_count > 0,
      optional: false,
      target: section("domaines"),
    },
    {
      key: "portal",
      label: "Page d'accueil du site publiée",
      detail: status.portal_published
        ? "Le portail sert la page composée."
        : "Sans page publiée, le portail affiche sa mise en page par défaut.",
      done: status.portal_published,
      optional: true,
      target: { kind: "portal" },
    },
    {
      key: "ai_quota",
      label: "Plafond IA décidé",
      detail: !status.ai_quota_decided
        ? "Aucune décision : la consommation est illimitée."
        : status.ai_quota_active
          ? "Un plafond mensuel borne la consommation."
          : "Illimité, par choix explicite.",
      done: status.ai_quota_decided,
      optional: false,
      target: section("ia"),
    },
    {
      key: "logo",
      label: "Logo dans la charte graphique",
      detail: status.logo_present
        ? "Repris par le portail et les applications."
        : "Sans logo, le portail affiche une pastille à la place.",
      done: status.logo_present,
      optional: true,
      target: section("charte"),
    },
    {
      key: "contact_roles",
      label: "Rôles de contact",
      detail:
        status.contact_role_count > 0
          ? `${status.contact_role_count} rôle${status.contact_role_count > 1 ? "s" : ""}, posés à la création.`
          : "Aucun rôle : le référentiel des usagers refuserait toute attribution. Rejouez le provisioning depuis la page Plateforme.",
      done: status.contact_role_count > 0,
      optional: false,
      target: null,
    },
  );

  return items;
}

/** Progression sur les seules lignes requises : le facultatif ne retient pas. */
export function checklistProgress(items: ChecklistItem[]): { done: number; total: number } {
  const required = items.filter((item) => !item.optional);
  return { done: required.filter((item) => item.done).length, total: required.length };
}
