/**
 * Étape « Informations demandeur » : modèle de la configuration des données
 * demandées au requérant. Logique pure (aucune dépendance React/Supabase),
 * consommée par `DemandeurStep` et persistée dans `procedures.requester_config`.
 */

/** Publics pouvant effectuer une démarche. */
export type Audience = "citoyen" | "entreprise" | "association";

/** État d'un champ demandé au requérant. */
export type FieldVisibility = "obligatoire" | "visible" | "masque";

export interface FieldDef {
  key: string;
  label: string;
}

/** Options d'état, dans l'ordre d'affichage (du moins au plus contraignant). */
export const FIELD_VISIBILITIES: { value: FieldVisibility; label: string }[] = [
  { value: "masque", label: "Masqué" },
  { value: "visible", label: "Visible" },
  { value: "obligatoire", label: "Obligatoire" },
];

const VALID_VISIBILITIES: readonly FieldVisibility[] = [
  "obligatoire",
  "visible",
  "masque",
];

/** État par défaut d'un champ : masqué (minimisation des données). */
const DEFAULT_VISIBILITY: FieldVisibility = "masque";

const CITOYEN_FIELDS: FieldDef[] = [
  { key: "civilite", label: "Civilité" },
  { key: "nom_naissance", label: "Nom de naissance" },
  { key: "nom_usuel", label: "Nom usuel" },
  { key: "prenoms", label: "Prénom(s)" },
  { key: "adresse", label: "Adresse" },
  { key: "tel_portable", label: "Numéro de téléphone portable" },
  { key: "tel_fixe", label: "Numéro de téléphone fixe" },
  { key: "courriel", label: "Courriel" },
];

// Entreprises et associations partagent le même jeu de champs.
const ORGANISATION_FIELDS: FieldDef[] = [
  { key: "siret", label: "SIRET" },
  { key: "raison_sociale", label: "Raison sociale" },
  { key: "adresse", label: "Adresse" },
  { key: "tel_portable", label: "Numéro de téléphone portable" },
  { key: "tel_fixe", label: "Numéro de téléphone fixe" },
  { key: "courriel", label: "Courriel" },
];

/** Publics dans l'ordre d'affichage, avec leur libellé et leurs champs. */
export const AUDIENCES: { key: Audience; label: string; fields: FieldDef[] }[] = [
  { key: "citoyen", label: "Citoyens", fields: CITOYEN_FIELDS },
  { key: "entreprise", label: "Entreprises", fields: ORGANISATION_FIELDS },
  { key: "association", label: "Associations", fields: ORGANISATION_FIELDS },
];

export interface AudienceConfig {
  enabled: boolean;
  fields: Record<string, FieldVisibility>;
}

export type RequesterConfig = Record<Audience, AudienceConfig>;

function defaultAudienceConfig(fields: FieldDef[]): AudienceConfig {
  const map: Record<string, FieldVisibility> = {};
  for (const f of fields) map[f.key] = DEFAULT_VISIBILITY;
  return { enabled: false, fields: map };
}

/** Config vierge : tous publics désactivés, tous champs masqués. */
export function defaultRequesterConfig(): RequesterConfig {
  return {
    citoyen: defaultAudienceConfig(CITOYEN_FIELDS),
    entreprise: defaultAudienceConfig(ORGANISATION_FIELDS),
    association: defaultAudienceConfig(ORGANISATION_FIELDS),
  };
}

/**
 * Les publics ACTIVÉS d'une démarche, dans l'ordre d'`AUDIENCES` — « à qui
 * cette démarche s'adresse ». C'est ce sur quoi le portail filtre (« Je
 * suis… »), et c'est le seul morceau de `requester_config` qui a affaire à un
 * usager : le reste (quels champs, obligatoires ou non) ne le concerne qu'une
 * fois la démarche choisie.
 *
 * ⚠️ LA LISTE PEUT ÊTRE VIDE, et ce n'est pas une anomalie : une démarche dont
 * l'étape « Informations demandeur » n'a jamais été remplie ne s'adresse à
 * aucun public déclaré. Elle ne répond alors à aucun choix du filtre — elle
 * reste visible tant qu'on ne filtre pas. La traiter comme « tous publics »
 * la ferait apparaître sous chaque choix, y compris là où elle n'est pas
 * ouverte.
 */
export function enabledAudiences(raw: unknown): Audience[] {
  const config = parseRequesterConfig(raw);
  return AUDIENCES.filter((audience) => config[audience.key].enabled).map((a) => a.key);
}

function coerceVisibility(value: unknown): FieldVisibility {
  return typeof value === "string" && VALID_VISIBILITIES.includes(value as FieldVisibility)
    ? (value as FieldVisibility)
    : DEFAULT_VISIBILITY;
}

/**
 * Fusionne une config stockée (JSON arbitraire venant de la base) avec les
 * valeurs par défaut : ignore les publics/champs inconnus, corrige les valeurs
 * invalides, complète les champs manquants. Toujours une config complète en sortie.
 */
export function parseRequesterConfig(raw: unknown): RequesterConfig {
  const config = defaultRequesterConfig();
  if (!raw || typeof raw !== "object") return config;

  const stored = raw as Record<string, unknown>;
  for (const audience of AUDIENCES) {
    const audienceRaw = stored[audience.key];
    if (!audienceRaw || typeof audienceRaw !== "object") continue;

    const { enabled, fields } = audienceRaw as { enabled?: unknown; fields?: unknown };
    if (typeof enabled === "boolean") config[audience.key].enabled = enabled;

    if (fields && typeof fields === "object") {
      const storedFields = fields as Record<string, unknown>;
      for (const field of audience.fields) {
        if (field.key in storedFields) {
          config[audience.key].fields[field.key] = coerceVisibility(storedFields[field.key]);
        }
      }
    }
  }
  return config;
}
