/**
 * Les chiffres d'accueil d'une collectivité — lecture tolérante de la RPC
 * `organization_dashboard`, et la seule mise en forme qu'ils demandent.
 *
 * Module PUR (aucune dépendance React ni Supabase), testé.
 *
 * ⚠️ LECTEUR TOLÉRANT, motif `parseOnboardingStatus` : la RPC rend du JSON et
 * gagnera des clés. Une clé absente vaut zéro ou liste vide, jamais une
 * exception — l'accueil de l'application ne doit pas tomber parce que la base
 * a une version d'avance ou de retard. C'est l'écran le plus exposé du
 * produit : c'est le premier qu'un agent voit en se connectant.
 */

export interface DashboardProcedures {
  total: number;
  production: number;
}

export interface DashboardContacts {
  total: number;
  personne: number;
  entreprise: number;
  association: number;
  administration: number;
}

export interface DashboardOrganization {
  id: string;
  name: string;
  parentId: string | null;
  isInternalService: boolean;
  enabledProcedures: number;
}

export interface DashboardStats {
  procedures: DashboardProcedures;
  contacts: DashboardContacts;
  organizations: DashboardOrganization[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function count(source: Record<string, unknown>, key: string): number {
  const raw = source[key];
  // La RPC rend des `count(*)`, que PostgREST peut servir en nombre ou en
  // chaîne selon la taille : les deux se lisent, le reste vaut zéro.
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(Math.trunc(raw), 0);
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(Math.trunc(parsed), 0) : 0;
  }
  return 0;
}

export function parseDashboardStats(value: unknown): DashboardStats {
  const root = record(value);
  const procedures = record(root.procedures);
  const contacts = record(root.contacts);
  const organizations = Array.isArray(root.organizations) ? root.organizations : [];

  return {
    procedures: {
      total: count(procedures, "total"),
      production: count(procedures, "production"),
    },
    contacts: {
      total: count(contacts, "total"),
      personne: count(contacts, "personne"),
      entreprise: count(contacts, "entreprise"),
      association: count(contacts, "association"),
      administration: count(contacts, "administration"),
    },
    organizations: organizations.flatMap((raw) => {
      const org = record(raw);
      const id = typeof org.id === "string" ? org.id : null;
      const name = typeof org.name === "string" ? org.name.trim() : "";
      // Une ligne sans identifiant ni nom n'est pas affichable : on l'écarte,
      // les autres restent (motif `parsePortalPage`, tolérant section par
      // section).
      if (id === null || name === "") return [];
      return [{
        id,
        name,
        parentId: typeof org.parent_id === "string" ? org.parent_id : null,
        isInternalService: org.is_internal_service === true,
        enabledProcedures: count(org, "enabled_procedures"),
      }];
    }),
  };
}

/** L'état de départ, avant que la requête ait répondu. */
export function emptyDashboardStats(): DashboardStats {
  return {
    procedures: { total: 0, production: 0 },
    contacts: { total: 0, personne: 0, entreprise: 0, association: 0, administration: 0 },
    organizations: [],
  };
}

export interface ActivationRow {
  id: string;
  name: string;
  count: number;
}

/**
 * Les lignes du graphique « Démarches activées par organisme ».
 *
 * ⚠️ LES ORGANISMES SANS AUCUNE ACTIVATION SONT ÉCARTÉS, et c'est le seul
 * choix qui demande d'être défendu : une barre à zéro n'apprend rien, et un
 * organigramme de trente services en écraserait les cinq qui instruisent. Le
 * compte total des organismes se lit ailleurs (l'onglet « Informations de
 * base », l'organigramme) ; ici on regarde qui porte le catalogue.
 *
 * ⚠️ Les SERVICES INTERNES restent dans la liste, sous leur propre nom : c'est
 * un écran d'agent, pas le portail. Ce qui s'efface derrière son porteur, ce
 * sont les démarches vues par un USAGER — jamais l'organigramme interne.
 * Le classement est décroissant, à égalité par nom, pour que deux rendus
 * successifs ne s'échangent pas deux barres.
 */
export function activationRows(stats: DashboardStats): ActivationRow[] {
  return stats.organizations
    .filter((org) => org.enabledProcedures > 0)
    .map((org) => ({ id: org.id, name: org.name, count: org.enabledProcedures }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"));
}

/** Nombres à la française, partout où un chiffre s'affiche. */
export function formatCount(value: number): string {
  return value.toLocaleString("fr-FR");
}

/**
 * La sous-ligne de la tuile « Démarches ». Le brouillon n'est mentionné que
 * s'il y en a : « 0 en brouillon » ferait lire un manque là où il n'y en a pas.
 */
export function proceduresSubtitle(procedures: DashboardProcedures): string {
  const drafts = Math.max(procedures.total - procedures.production, 0);
  const production = `${formatCount(procedures.production)} en production`;
  return drafts > 0 ? `${production} · ${formatCount(drafts)} en brouillon` : production;
}

/**
 * La sous-ligne de la tuile « Usagers ». Les administrations ne méritent pas
 * leur propre tuile (elles sont rares), mais les taire ferait un total qui ne
 * se retrouve pas dans les trois tuiles voisines.
 */
export function contactsSubtitle(contacts: DashboardContacts): string {
  if (contacts.total === 0) return "Aucune fiche active";
  return contacts.administration > 0
    ? `Fiches actives · dont ${formatCount(contacts.administration)} administration${contacts.administration > 1 ? "s" : ""}`
    : "Fiches actives";
}
