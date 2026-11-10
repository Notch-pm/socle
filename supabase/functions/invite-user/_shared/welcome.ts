/**
 * Le message de bienvenue d'un agent — logique PURE (sans Deno ni réseau),
 * testée par vitest, déployée avec `index.ts`.
 *
 * Connexion unique (lot 4, décision du 2026-11-10) : l'agent ne choisit plus
 * un mot de passe par application. Keycloak (`auth.edilumen.fr`) l'identifie
 * pour toute la gamme — par l'annuaire de sa collectivité, ou par un compte
 * Keycloak qu'il crée lui-même à sa première connexion (inscription ouverte,
 * e-mail vérifié ; un compte sans accès au Socle n'ouvre rien). D'où UN seul
 * e-mail, envoyé par le Socle : les applications ouvertes, et comment s'y
 * connecter. Plus de lien d'activation, ni ici ni dans Clara et Iris.
 *
 * ⚠️ MIROIR de `src/components/layout/suiteApps.ts` (une edge function
 * n'importe rien de `src/`) : clés = sous-domaines, noms et accroches
 * identiques — épinglé par `welcome.test.ts`.
 */

export interface WelcomeApp {
  key: string;
  name: string;
  tagline: string;
}

export const SUITE_DOMAIN = "edilumen.fr";

/** Les applications d'agent de la gamme, dans l'ordre du lanceur. */
export const SUITE_APPS: readonly WelcomeApp[] = [
  { key: "socle", name: "Socle", tagline: "Organisations et paramétrage" },
  { key: "iris", name: "Iris", tagline: "Gestion des demandes" },
  { key: "clara", name: "Clara", tagline: "Gestion du courrier" },
  { key: "ariane", name: "Ariane", tagline: "Gestion de file d'attente" },
];

export function appUrl(app: WelcomeApp): string {
  return `https://${app.key}.${SUITE_DOMAIN}`;
}

/**
 * Les applications ouvertes à l'agent, dans l'ordre du lanceur : le Socle s'il
 * y a un accès, puis les applications de ses accès. Une application inconnue
 * du catalogue (Nora : portail des usagers) n'est pas proposée.
 */
export function welcomeApps(socleAccess: boolean, applicationIds: string[]): WelcomeApp[] {
  const wanted = new Set(applicationIds);
  if (socleAccess) wanted.add("socle");
  return SUITE_APPS.filter((app) => wanted.has(app.key));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

export interface WelcomeMessage {
  subject: string;
  heading: string;
  /** Corps HTML (paragraphes stylés), à poser dans le cadre `renderBrandedEmail`. */
  bodyHtml: string;
  text: string;
  /** Bouton du cadre : la première application ouverte. */
  action: { label: string; url: string } | null;
}

const P = 'style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#52525b;"';

/** Le message, pour une collectivité et des applications données. */
export function welcomeMessage(siteName: string, apps: WelcomeApp[]): WelcomeMessage {
  const name = escapeHtml(siteName);
  const list = apps
    .map(
      (app) =>
        `<li style="margin:0 0 6px;"><a href="${appUrl(app)}" style="color:#2563eb;">${escapeHtml(app.name)}</a> — ${escapeHtml(app.tagline)}</li>`,
    )
    .join("");
  const bodyHtml = [
    `<p ${P}>Un accès vous a été ouvert par <strong>${name}</strong>${apps.length ? " :" : "."}</p>`,
    apps.length ? `<ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.6;color:#52525b;">${list}</ul>` : "",
    `<p ${P}>Pour vous connecter, choisissez « <strong>Se connecter avec le compte de ma collectivité</strong> ». Un seul compte vaut pour toutes les applications : une fois connecté à l'une, vous l'êtes aux autres.</p>`,
    `<p ${P}>Si votre collectivité a relié son annuaire (Microsoft…), utilisez votre compte habituel. Sinon, à votre première connexion, choisissez « Créer mon compte » avec cette adresse : vous définirez alors votre mot de passe, une seule fois.</p>`,
  ].join("");
  const text = [
    `Un accès vous a été ouvert par ${siteName}${apps.length ? " :" : "."}`,
    ...apps.map((app) => `- ${app.name} (${app.tagline}) : ${appUrl(app)}`),
    "",
    "Pour vous connecter, choisissez « Se connecter avec le compte de ma collectivité ». Un seul compte vaut pour toutes les applications.",
    "Si votre collectivité a relié son annuaire (Microsoft…), utilisez votre compte habituel. Sinon, à votre première connexion, choisissez « Créer mon compte » avec cette adresse : vous définirez votre mot de passe une seule fois.",
    "",
    siteName,
  ].join("\n");
  const first = apps[0];
  return {
    subject: `Vos accès — ${siteName}`,
    heading: "Bienvenue !",
    bodyHtml,
    text,
    action: first ? { label: `Ouvrir ${first.name}`, url: appUrl(first) } : null,
  };
}
