/**
 * Modèles de courriels — résolution pure, sans dépendance.
 *
 * ⚠️ Ce fichier existe en DEUX copies BYTE-IDENTIQUES :
 *   - `src/features/email-templates/emailTemplates.ts` (l'écran) ;
 *   - `supabase/functions/public-api/_shared/emailTemplates.ts` (l'API).
 * Une edge function n'importe rien de `src/` : la duplication est acceptée, la
 * dérive ne l'est pas (`emailTemplatesMirror.test.ts`). Toute modification de
 * l'un se recopie dans l'autre.
 *
 * Deux familles, une seule liste :
 *  • les courriels SYSTÈME (catalogue plateforme `email_template_defaults`),
 *    toujours présents — leur texte est celui du catalogue, sauf si la
 *    collectivité l'a personnalisé (ligne `email_templates` à `system_key`) ;
 *  • les modèles CRÉÉS par la collectivité (`system_key` NULL), avec leurs
 *    applications (`email_template_applications`).
 * Héritage résolu à la lecture, jamais recopié : un courriel système ne
 * disparaît pas, et « rétablir le texte d'origine » = retirer la surcharge.
 */

/** Ligne du catalogue plateforme (`email_template_defaults`). */
export interface EmailTemplateDefaultRow {
  key: string;
  name: string;
  description: string | null;
  subject: string;
  body: string;
  application_ids: string[];
  variables: string[];
  position: number;
}

/** Ligne d'une collectivité (`email_templates`). */
export interface EmailTemplateRow {
  id: string;
  organization_id: string;
  system_key: string | null;
  name: string | null;
  description: string | null;
  subject: string;
  body: string;
  updated_at: string;
}

/** Lien modèle créé ↔ application (`email_template_applications`). */
export interface EmailTemplateApplicationRow {
  email_template_id: string;
  application_id: string;
}

/**
 * Activation d'un modèle créé dans un organisme (`email_template_organizations`).
 * Pas de descendance implicite : cocher la racine n'ouvre pas ses services.
 */
export interface EmailTemplateOrganizationRow {
  email_template_id: string;
  organization_id: string;
}

/** Un courriel tel qu'il s'affiche et se sert : texte effectif, applications. */
export interface ResolvedEmailTemplate {
  /** Ligne `email_templates` — `null` pour un courriel système jamais personnalisé. */
  id: string | null;
  /** Clé du catalogue — `null` pour un modèle créé. */
  key: string | null;
  organization_id: string;
  name: string;
  description: string | null;
  subject: string;
  body: string;
  applications: string[];
  /**
   * Organismes où un modèle CRÉÉ est proposé, triés ; `null` pour un courriel
   * système, qui vaut partout. Un modèle créé sans organisme n'est proposé nulle part.
   */
  organization_ids: string[] | null;
  is_system: boolean;
  /** Courriel système dont l'objet ou le corps a été personnalisé. */
  is_customized: boolean;
  /** Variables que l'application fournit (courriel système) ; vide pour un modèle créé. */
  variables: string[];
  /** Date de la personnalisation ou de la dernière modification ; `null` = texte d'origine. */
  updated_at: string | null;
  /** Texte d'origine d'un courriel système (pour « rétablir ») ; `null` pour un modèle créé. */
  default_subject: string | null;
  default_body: string | null;
}

export const EMAIL_SUBJECT_MAX_LENGTH = 255;
export const EMAIL_BODY_MAX_LENGTH = 20000;
export const EMAIL_NAME_MAX_LENGTH = 200;
export const EMAIL_DESCRIPTION_MAX_LENGTH = 1000;

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "fr", { sensitivity: "base" });
}

/**
 * La liste résolue d'UNE racine : les courriels système dans l'ordre du
 * catalogue, puis les modèles créés par ordre alphabétique. Les lignes d'une
 * autre organisation sont ignorées ; une surcharge dont la clé n'existe plus
 * au catalogue aussi (la FK l'interdit, la lecture reste tolérante).
 */
export function resolveEmailTemplates(
  organizationId: string,
  defaults: readonly EmailTemplateDefaultRow[],
  rows: readonly EmailTemplateRow[],
  links: readonly EmailTemplateApplicationRow[],
  organizationLinks: readonly EmailTemplateOrganizationRow[] = [],
): ResolvedEmailTemplate[] {
  const own = rows.filter((row) => row.organization_id === organizationId);
  const overrides = new Map<string, EmailTemplateRow>();
  for (const row of own) if (row.system_key) overrides.set(row.system_key, row);

  const system = [...defaults]
    .sort((a, b) => a.position - b.position || compareText(a.name, b.name))
    .map((def): ResolvedEmailTemplate => {
      const override = overrides.get(def.key) ?? null;
      return {
        id: override?.id ?? null,
        key: def.key,
        organization_id: organizationId,
        name: def.name,
        description: def.description,
        subject: override?.subject ?? def.subject,
        body: override?.body ?? def.body,
        applications: sortedUnique(def.application_ids),
        organization_ids: null,
        is_system: true,
        is_customized: override != null,
        variables: [...def.variables],
        updated_at: override?.updated_at ?? null,
        default_subject: def.subject,
        default_body: def.body,
      };
    });

  const appsByTemplate = new Map<string, string[]>();
  for (const link of links) {
    const list = appsByTemplate.get(link.email_template_id) ?? [];
    list.push(link.application_id);
    appsByTemplate.set(link.email_template_id, list);
  }

  const orgsByTemplate = new Map<string, string[]>();
  for (const link of organizationLinks) {
    const list = orgsByTemplate.get(link.email_template_id) ?? [];
    list.push(link.organization_id);
    orgsByTemplate.set(link.email_template_id, list);
  }

  const custom = own
    .filter((row) => row.system_key == null)
    .map((row): ResolvedEmailTemplate => ({
      id: row.id,
      key: null,
      organization_id: organizationId,
      name: row.name ?? "",
      description: row.description,
      subject: row.subject,
      body: row.body,
      applications: sortedUnique(appsByTemplate.get(row.id) ?? []),
      organization_ids: sortedUnique(orgsByTemplate.get(row.id) ?? []),
      is_system: false,
      is_customized: false,
      variables: [],
      updated_at: row.updated_at,
      default_subject: null,
      default_body: null,
    }))
    .sort((a, b) => compareText(a.name, b.name));

  return [...system, ...custom];
}

/** Les modèles qu'utilise une application donnée (`iris`, `clara`…). */
export function filterByApplication(
  templates: readonly ResolvedEmailTemplate[],
  applicationId: string,
): ResolvedEmailTemplate[] {
  return templates.filter((template) => template.applications.includes(applicationId));
}

/**
 * Les modèles proposés dans un organisme : les courriels système toujours, un
 * modèle créé seulement s'il y est activé nommément.
 */
export function filterByOrganization(
  templates: readonly ResolvedEmailTemplate[],
  organizationId: string,
): ResolvedEmailTemplate[] {
  return templates.filter(
    (template) =>
      template.organization_ids === null || template.organization_ids.includes(organizationId),
  );
}

/**
 * Les clés citées dans un texte : `{{cle}}`, et les sections `{{#cle}}` /
 * `{{/cle}}` (partie conditionnelle ou boucle). Sans doublon, dans l'ordre
 * d'apparition.
 */
export function extractVariables(text: string): string[] {
  const found: string[] = [];
  const pattern = /\{\{\s*[#/^]?\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

/**
 * Les variables citées qui ne figurent pas dans `known`. La base les REFUSE
 * (`trg_guard_email_template_variables`) : l'écran le dit plus tôt.
 */
export function unknownVariables(text: string, known: readonly string[]): string[] {
  const catalogue = new Set(known);
  return extractVariables(text).filter((key) => !catalogue.has(key));
}

/** Les sections ouvertes sans être fermées (ou l'inverse), qui casseraient le rendu. */
export function unbalancedSections(text: string): string[] {
  const stack: string[] = [];
  const broken: string[] = [];
  const pattern = /\{\{\s*([#/^])\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const [, sigil, key] = match;
    if (sigil === "/") {
      if (stack[stack.length - 1] === key) stack.pop();
      else if (!broken.includes(key)) broken.push(key);
    } else {
      stack.push(key);
    }
  }
  for (const key of stack) if (!broken.includes(key)) broken.push(key);
  return broken;
}

export interface EmailTemplateIssues {
  name?: string;
  description?: string;
  subject?: string;
  body?: string;
}

/**
 * Validation de saisie, miroir des CHECK SQL et de la garde des variables.
 * `name` n'est exigé, et `description` bornée, que pour un modèle créé ; `allowedVariables` = les variables
 * communes, plus celles du courriel système (`allowedEmailVariables`).
 */
export function validateEmailTemplate(input: {
  isSystem: boolean;
  name?: string | null;
  description?: string | null;
  subject: string;
  body: string;
  allowedVariables: readonly string[];
}): EmailTemplateIssues {
  const issues: EmailTemplateIssues = {};
  if (!input.isSystem) {
    const name = (input.name ?? "").trim();
    if (name === "") issues.name = "Le titre est obligatoire.";
    else if (name.length > EMAIL_NAME_MAX_LENGTH)
      issues.name = `Le titre ne doit pas dépasser ${EMAIL_NAME_MAX_LENGTH} caractères.`;
    if ((input.description ?? "").trim().length > EMAIL_DESCRIPTION_MAX_LENGTH)
      issues.description = `La description ne doit pas dépasser ${EMAIL_DESCRIPTION_MAX_LENGTH} caractères.`;
  }
  const unknownIssue = (text: string): string | undefined => {
    const unknown = unknownVariables(text, input.allowedVariables);
    return unknown.length > 0
      ? `Variable inconnue : ${unknown.map((k) => `{{${k}}}`).join(", ")}. Choisissez-la dans « Variables disponibles ».`
      : undefined;
  };
  if (input.subject.trim() === "") issues.subject = "L'objet est obligatoire.";
  else if (input.subject.length > EMAIL_SUBJECT_MAX_LENGTH)
    issues.subject = `L'objet ne doit pas dépasser ${EMAIL_SUBJECT_MAX_LENGTH} caractères.`;
  else {
    const unknown = unknownIssue(input.subject);
    if (unknown) issues.subject = unknown;
  }
  if (input.body.trim() === "") issues.body = "Le corps du courriel est obligatoire.";
  else if (input.body.length > EMAIL_BODY_MAX_LENGTH)
    issues.body = `Le corps ne doit pas dépasser ${EMAIL_BODY_MAX_LENGTH} caractères.`;
  else {
    const broken = unbalancedSections(input.body);
    if (broken.length > 0)
      issues.body = `Section mal fermée : ${broken.map((k) => `{{#${k}}}`).join(", ")}.`;
    else {
      const unknown = unknownIssue(input.body);
      if (unknown) issues.body = unknown;
    }
  }
  return issues;
}
