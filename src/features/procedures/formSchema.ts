/**
 * Schéma de formulaire possédé par Socle — le « contrat public » de l'étape
 * « Formulaire ». Logique pure (types + validation zod + fabriques + parseur
 * robuste), sans dépendance UI. Persisté dans `procedures.form_schema`.
 *
 * Le formulaire est une liste ordonnée de « nœuds » : chaque nœud est soit un
 * champ (au niveau racine), soit une section (groupe facultatif de champs).
 */
import { z } from "zod";
import type { Condition } from "./conditions";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "email"
  | "phone"
  | "boolean"
  | "select"
  | "radio"
  | "checkboxes"
  | "attachment";

export const CHOICE_TYPES = ["select", "radio", "checkboxes"] as const;
export type ChoiceType = (typeof CHOICE_TYPES)[number];

export interface FieldOption {
  value: string;
  label: string;
}

interface FieldCommon {
  id: string;
  /** Clé machine — la donnée du contrat consommée en aval. */
  key: string;
  label: string;
  help?: string;
  placeholder?: string;
  required?: boolean;
  /** Affiché seulement si la condition est satisfaite (sinon masqué). */
  visibleIf?: Condition;
}

export interface SimpleField extends FieldCommon {
  type: "text" | "textarea" | "number" | "date" | "email" | "phone" | "boolean";
  /** Longueur maximale (champs texte). */
  maxLength?: number;
}

export interface ChoiceField extends FieldCommon {
  type: ChoiceType;
  options: FieldOption[];
}

/** Nombre maximum de fichiers autorisés pour une pièce justificative. */
export const MAX_ATTACHMENT_FILES = 5;

export interface AttachmentField extends FieldCommon {
  type: "attachment";
  /**
   * Référence vers un type du catalogue `document_types` (l'`id`). Obligatoire à
   * la saisie — voir `attachmentFieldsMissingDocumentType`.
   */
  documentTypeId?: string;
  /** 1 = un seul fichier ; 2..5 = plusieurs fichiers (jusqu'à MAX_ATTACHMENT_FILES). */
  maxFiles: number;
  /** Formats de fichier acceptés (ex. ["pdf", "jpg"]). */
  acceptedFormats: string[];
  /** Obligatoire si la condition est satisfaite (en plus du `required` statique). */
  requiredIf?: Condition;
}

export type Field = SimpleField | ChoiceField | AttachmentField;

export interface Section {
  id: string;
  kind: "section";
  title: string;
  description?: string;
  visibleIf?: Condition;
  fields: Field[];
}

/** Un nœud racine du formulaire : un champ isolé ou une section. */
export type FormNode = Field | Section;

export interface FormSchema {
  version: 1;
  content: FormNode[];
}

export function isSection(node: FormNode): node is Section {
  return "kind" in node && node.kind === "section";
}

export function isChoiceType(type: FieldType): type is ChoiceType {
  return (CHOICE_TYPES as readonly string[]).includes(type);
}

/** Types de champ proposés dans le builder (la pièce jointe a son propre bouton). */
export const FIELD_TYPES: { value: Exclude<FieldType, "attachment">; label: string }[] = [
  { value: "text", label: "Texte court" },
  { value: "textarea", label: "Texte long" },
  { value: "number", label: "Nombre" },
  { value: "date", label: "Date" },
  { value: "email", label: "Courriel" },
  { value: "phone", label: "Téléphone" },
  { value: "select", label: "Liste déroulante" },
  { value: "radio", label: "Boutons radio" },
  { value: "checkboxes", label: "Cases à cocher" },
  { value: "boolean", label: "Oui / Non" },
];

function genId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "id-" + Math.random().toString(36).slice(2, 10);
}

export function createField(type: FieldType): Field {
  const common: FieldCommon = { id: genId(), key: "", label: "" };
  if (type === "attachment") {
    return { ...common, type, maxFiles: 1, acceptedFormats: ["pdf"] };
  }
  if (isChoiceType(type)) {
    return { ...common, type, options: [] };
  }
  return { ...common, type };
}

export function createSection(): Section {
  return { id: genId(), kind: "section", title: "", fields: [] };
}

/**
 * Bloc « Lieu d'intervention » : une section prête à l'emploi contenant tous
 * les champs d'une adresse (numéro, BTQ, voie, complément, appartement, code
 * postal, ville). C'est une section ordinaire du schéma (aucun type dédié dans
 * le contrat) — tout reste modifiable après insertion. Les clés sont préfixées
 * `intervention_` pour éviter les collisions avec d'autres champs.
 */
export function createLieuInterventionSection(): Section {
  return {
    id: genId(),
    kind: "section",
    title: "Lieu d'intervention",
    fields: [
      { id: genId(), key: "intervention_numero", label: "Numéro", type: "text" },
      {
        id: genId(),
        key: "intervention_btq",
        label: "BTQ",
        help: "Bis, ter, quater",
        type: "select",
        options: [
          { value: "bis", label: "Bis" },
          { value: "ter", label: "Ter" },
          { value: "quater", label: "Quater" },
        ],
      },
      { id: genId(), key: "intervention_voie", label: "Voie", type: "text", required: true },
      { id: genId(), key: "intervention_complement", label: "Complément d'adresse", type: "text" },
      { id: genId(), key: "intervention_appartement", label: "Appartement", type: "text" },
      {
        id: genId(),
        key: "intervention_code_postal",
        label: "Code postal",
        type: "text",
        required: true,
        maxLength: 5,
      },
      { id: genId(), key: "intervention_ville", label: "Ville", type: "text", required: true },
    ],
  };
}

export function defaultFormSchema(): FormSchema {
  return { version: 1, content: [] };
}

/**
 * Tous les champs de saisie du formulaire (racine + sections), à plat. Les
 * pièces jointes sont exclues car non comparables — usage : sources de condition.
 */
export function conditionSourceFields(schema: FormSchema): Field[] {
  const fields: Field[] = [];
  for (const node of schema.content) {
    if (isSection(node)) fields.push(...node.fields);
    else fields.push(node);
  }
  return fields.filter((f) => f.type !== "attachment");
}

/**
 * Ids des pièces justificatives (racine + sections) auxquelles il manque un
 * type de pièce. Le type est **obligatoire à la saisie** : sert à bloquer
 * l'enregistrement du formulaire tant qu'une PJ n'est pas typée.
 */
export function attachmentFieldsMissingDocumentType(schema: FormSchema): string[] {
  const missing: string[] = [];
  const check = (field: Field) => {
    if (field.type === "attachment" && !field.documentTypeId) missing.push(field.id);
  };
  for (const node of schema.content) {
    if (isSection(node)) node.fields.forEach(check);
    else check(node);
  }
  return missing;
}

/**
 * Toutes les pièces justificatives du formulaire (racine + sections), à plat et
 * dans l'ordre. Miroir de `conditionSourceFields`, qui les exclut : ici on ne
 * veut qu'elles.
 *
 * Usage : le récapitulatif en lecture seule de l'étape « Communication usager »,
 * qui montre à l'agent ce que le formulaire collecte déjà — pour qu'il n'ait pas
 * à le deviner en rédigeant la liste qu'il ANNONCE à l'usager.
 */
export function attachmentFields(schema: FormSchema): AttachmentField[] {
  const attachments: AttachmentField[] = [];
  const collect = (field: Field) => {
    if (field.type === "attachment") attachments.push(field);
  };
  for (const node of schema.content) {
    if (isSection(node)) node.fields.forEach(collect);
    else collect(node);
  }
  return attachments;
}

// ---- Validation / parsing --------------------------------------------------

const conditionSchema = z.object({
  combinator: z.enum(["and", "or"]),
  rules: z.array(
    z.object({
      fieldId: z.string(),
      operator: z.enum(["equals", "notEquals", "includes", "isEmpty", "isNotEmpty"]),
      value: z.union([z.string(), z.array(z.string())]).optional(),
    }),
  ),
});

const fieldCommonShape = {
  id: z.string(),
  key: z.string(),
  label: z.string(),
  help: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
  visibleIf: conditionSchema.optional(),
};

const simpleFieldSchema = z.object({
  ...fieldCommonShape,
  type: z.enum(["text", "textarea", "number", "date", "email", "phone", "boolean"]),
  maxLength: z.number().optional(),
});

const choiceFieldSchema = z.object({
  ...fieldCommonShape,
  type: z.enum(["select", "radio", "checkboxes"]),
  options: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
});

const attachmentFieldSchema = z.object({
  ...fieldCommonShape,
  type: z.literal("attachment"),
  documentTypeId: z.string().optional(),
  maxFiles: z.number().default(1),
  acceptedFormats: z.array(z.string()).default([]),
  requiredIf: conditionSchema.optional(),
});

// Ordre important : les schémas les plus spécifiques (choix, PJ) avant le simple.
const fieldSchema = z.union([choiceFieldSchema, attachmentFieldSchema, simpleFieldSchema]);

const sectionSchema = z.object({
  id: z.string(),
  kind: z.literal("section"),
  title: z.string(),
  description: z.string().optional(),
  visibleIf: conditionSchema.optional(),
  fields: z.array(fieldSchema).default([]),
});

// Une section (a une `kind`) ou un champ (a un `type`) — distinguables sans ambiguïté.
const nodeSchema = z.union([sectionSchema, fieldSchema]);

const formSchemaZod = z.object({
  version: z.literal(1).default(1),
  content: z.array(nodeSchema).default([]),
});

/**
 * Transforme un JSON stocké (arbitraire) en `FormSchema` valide. En cas de
 * structure invalide, retombe sur un schéma vide plutôt que de planter.
 */
export function parseFormSchema(raw: unknown): FormSchema {
  if (!raw) return defaultFormSchema();
  const result = formSchemaZod.safeParse(raw);
  return result.success ? (result.data as FormSchema) : defaultFormSchema();
}
