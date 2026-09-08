// Résolution du relais d'envoi des courriels d'AUTHENTIFICATION : le relais de
// la collectivité d'abord (`resolve_smtp_settings`), le relais de plateforme en
// repli (secrets `PLATFORM_SMTP_*`). Module PUR (aucune dépendance Deno),
// testé par vitest.
//
// ⚠️ IDENTIQUE dans `invite-user/_shared/` et `auth-email-hook/_shared/` — un
// test d'identité l'exige (`smtp.test.ts`). Pas de `_shared` de premier
// niveau : le déploiement MCP (`deploy_edge_function`, fichiers relatifs à la
// racine de la fonction) ne sait pas exprimer `../_shared/`.
//
// Le repli ne couvre QUE l'authentification — invitation, activation, mot de
// passe oublié. Ce sont des courriels de la plateforme : sans lui, une
// collectivité fraîchement créée ne pouvait inviter personne tant qu'elle
// n'avait pas saisi son propre relais (poule et œuf du 2026-09-08), et un
// super administrateur sans organisation ne pouvait pas réinitialiser son mot
// de passe. Les courriels MÉTIER restent sur le relais de la collectivité :
// `send-test-email` et les applications de la gamme ne connaissent pas ce
// repli, et ne doivent pas le connaître.
//
// La collectivité l'emporte toujours : quand elle a un relais, ses courriels
// partent de son domaine. Le repli n'est pas un second expéditeur possible,
// c'est l'absence d'expéditeur évitée.

/** Ligne renvoyée par `resolve_smtp_settings`. */
export interface SmtpRow {
  host?: string | null;
  port?: number | null;
  username?: string | null;
  password?: string | null;
  from_email?: string | null;
  from_name?: string | null;
  use_tls?: boolean | null;
}

export interface SmtpConfig {
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  fromEmail: string;
  fromName: string | null;
  useTls: boolean;
  /** Journalisée côté serveur pour diagnostiquer un envoi — jamais renvoyée au navigateur. */
  source: "collectivite" | "plateforme";
}

export const DEFAULT_SMTP_PORT = 587;

/** Les secrets du repli, tels que `docs/operations.md` les nomme. */
export const PLATFORM_SMTP_SECRETS = [
  "PLATFORM_SMTP_HOST",
  "PLATFORM_SMTP_PORT",
  "PLATFORM_SMTP_USERNAME",
  "PLATFORM_SMTP_PASSWORD",
  "PLATFORM_SMTP_FROM_EMAIL",
  "PLATFORM_SMTP_FROM_NAME",
  "PLATFORM_SMTP_USE_TLS",
] as const;

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nonEmpty(value: unknown): string | null {
  const v = trimmed(value);
  return v === "" ? null : v;
}

function parsePort(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseInt(trimmed(value), 10);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : DEFAULT_SMTP_PORT;
}

/**
 * `use_tls` absent ⇒ true : le chiffrement est le défaut, une configuration
 * incomplète ne doit pas dégrader silencieusement vers du clair.
 */
function parseTls(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const v = trimmed(value).toLowerCase();
  if (v === "false" || v === "0" || v === "no" || v === "non") return false;
  return true;
}

/** Relais de la collectivité. `null` si l'essentiel manque (hôte, expéditeur). */
export function smtpFromRow(row: SmtpRow | null | undefined): SmtpConfig | null {
  if (!row) return null;
  const host = trimmed(row.host);
  const fromEmail = trimmed(row.from_email).toLowerCase();
  if (host === "" || fromEmail === "") return null;
  return {
    host,
    port: parsePort(row.port),
    username: nonEmpty(row.username),
    password: nonEmpty(row.password),
    fromEmail,
    fromName: nonEmpty(row.from_name),
    useTls: parseTls(row.use_tls),
    source: "collectivite",
  };
}

/** Relais de plateforme, depuis les secrets d'edge function. */
export function smtpFromEnv(env: Record<string, string | undefined>): SmtpConfig | null {
  const host = trimmed(env.PLATFORM_SMTP_HOST);
  const fromEmail = trimmed(env.PLATFORM_SMTP_FROM_EMAIL).toLowerCase();
  if (host === "" || fromEmail === "") return null;
  return {
    host,
    port: parsePort(env.PLATFORM_SMTP_PORT),
    username: nonEmpty(env.PLATFORM_SMTP_USERNAME),
    password: nonEmpty(env.PLATFORM_SMTP_PASSWORD),
    fromEmail,
    fromName: nonEmpty(env.PLATFORM_SMTP_FROM_NAME),
    useTls: parseTls(env.PLATFORM_SMTP_USE_TLS),
    source: "plateforme",
  };
}

/** La collectivité d'abord, la plateforme ensuite, rien sinon. */
export function resolveSmtp(
  row: SmtpRow | null | undefined,
  env: Record<string, string | undefined>,
): SmtpConfig | null {
  return smtpFromRow(row) ?? smtpFromEnv(env);
}

/** En-tête `From:` — un nom d'expédition entre guillemets, l'adresse entre chevrons. */
export function senderHeader(config: SmtpConfig): string {
  return config.fromName
    ? `"${config.fromName.replace(/"/g, "'")}" <${config.fromEmail}>`
    : config.fromEmail;
}

/**
 * `secure` de nodemailer = TLS implicite, c'est-à-dire le port 465 seulement.
 * Sur 587 la connexion démarre en clair puis passe en TLS par STARTTLS — y
 * forcer `secure` fait échouer la poignée de main (piège classique).
 */
export function useImplicitTls(config: SmtpConfig): boolean {
  return config.useTls && config.port === 465;
}

/**
 * Le nom sous lequel le courriel se présente. Depuis le relais de la
 * collectivité, c'est elle ; depuis le repli, c'est elle aussi quand on la
 * connaît (l'invitation parle de la collectivité), sinon la plateforme.
 */
export function siteNameFor(
  organizationName: string | null | undefined,
  env: Record<string, string | undefined>,
): string {
  return nonEmpty(organizationName) ?? nonEmpty(env.PLATFORM_SMTP_FROM_NAME) ?? "Edilumen";
}
