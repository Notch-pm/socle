/**
 * Domaines du portail usagers : mise en forme et validation d'un nom d'hôte.
 * Logique pure (ni React ni Supabase), testée.
 *
 * ⚠️ La base reste l'arbitre. Le trigger `normalize_organization_domain` range
 * ce qu'on lui envoie (minuscules, espaces et point final retirés) et la
 * contrainte `organization_domains_hostname_check` refuse ce qui n'est pas un
 * FQDN. Ce module n'est pas une seconde vérité : il évite l'aller-retour et
 * permet de MONTRER à l'administrateur la forme qui sera réellement stockée —
 * ce qui compte, puisque l'unicité porte sur elle.
 *
 * Il est en revanche délibérément PLUS tolérant en entrée que le trigger : on
 * colle une adresse de navigateur (`https://nantes.edilumen.fr/`) bien plus
 * souvent qu'on ne tape un nom d'hôte nu. Ce que le trigger recevra sera déjà
 * canonique.
 */

/** Longueur maximale d'un nom de domaine (RFC 1035), reprise par la contrainte. */
export const HOSTNAME_MAX_LENGTH = 253;

/** Deux labels d'un caractère et un point : le plus court FQDN possible. */
export const HOSTNAME_MIN_LENGTH = 4;

/** Longueur maximale d'un label DNS (RFC 1035), reprise par `dns_label_from_slug`. */
export const DNS_LABEL_MAX_LENGTH = 63;

/** Miroir de `organization_domains_hostname_check`. */
const FQDN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Ce qui reste autorisé une fois la casse et les séparateurs traités. */
const ALLOWED_CHARS_RE = /^[a-z0-9.-]+$/;

/**
 * Forme canonique d'un nom d'hôte, telle qu'elle sera stockée.
 *
 * Retire le schéma, l'éventuel chemin, le port et le point final, et passe en
 * minuscules. Ne juge pas de la validité : `validateHostname` s'en charge.
 */
export function normalizeHostname(raw: string): string {
  let value = raw.trim().toLowerCase();
  // Adresse collée depuis un navigateur : on ne garde que l'hôte.
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.split("/")[0];
  value = value.split("?")[0];
  value = value.replace(/:\d+$/, "");
  return value.replace(/\.+$/, "");
}

/**
 * Message d'erreur pour un nom d'hôte, ou `null` s'il est acceptable.
 *
 * Les messages nomment le défaut précis plutôt que « domaine invalide » :
 * l'administrateur doit savoir quoi corriger sans deviner.
 */
export function validateHostname(raw: string): string | null {
  const hostname = normalizeHostname(raw);

  if (hostname === "") return "Renseignez un nom de domaine.";

  if (hostname.length > HOSTNAME_MAX_LENGTH) {
    return `Un nom de domaine ne peut pas dépasser ${HOSTNAME_MAX_LENGTH} caractères.`;
  }

  if (!ALLOWED_CHARS_RE.test(hostname)) {
    return "Un nom de domaine ne peut contenir que des lettres, des chiffres, des points et des tirets.";
  }

  if (!hostname.includes(".")) {
    // Le cas de loin le plus fréquent en développement, et il mérite mieux
    // qu'un refus muet : la simulation locale se règle côté portail.
    if (hostname === "localhost") {
      return "« localhost » n'est pas un domaine de collectivité. En développement, le portail simule un domaine réel.";
    }
    return "Un domaine doit comporter au moins deux niveaux, par exemple nantes.edilumen.fr.";
  }

  if (!FQDN_RE.test(hostname)) {
    return "Chaque niveau du domaine doit commencer et finir par une lettre ou un chiffre, sans point ni tiret isolé.";
  }

  if (hostname.length < HOSTNAME_MIN_LENGTH) {
    return "Ce nom de domaine est trop court.";
  }

  return null;
}

/** Adresse du portail pour ce domaine — de quoi l'ouvrir depuis l'écran. */
export function portalUrl(hostname: string): string {
  return `https://${hostname}`;
}

// ---------------------------------------------------------------------------
// Sous-domaine fourni
// ---------------------------------------------------------------------------

/**
 * Ce que `unaccent` de Postgres fait des lettres que la décomposition Unicode
 * ne sépare pas : une ligature ou une lettre barrée n'a pas de diacritique à
 * retirer, elle se translittère.
 */
const TRANSLITERATIONS: Record<string, string> = {
  "œ": "oe", "æ": "ae", "ß": "ss", "ø": "o", "ł": "l", "đ": "d", "ð": "d", "þ": "th",
};

function unaccent(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    // Les diacritiques détachés par NFD sont des « marques » Unicode.
    .replace(/\p{M}/gu, "")
    .replace(/[œæßøłđðþ]/g, (c) => TRANSLITERATIONS[c] ?? c);
}

/**
 * Label DNS dérivé d'un slug — MIROIR de `dns_label_from_slug` (SQL, migration
 * `provision_root_organization`). Mêmes règles, mêmes cas de test : sans
 * accents, minuscules, tout ce qui n'est pas `[a-z0-9]` devient un tiret, pas
 * de tiret aux bords, 63 caractères au plus, `null` s'il ne reste rien.
 *
 * C'est ce label, suivi de la zone de la plateforme, qui devient le
 * sous-domaine fourni d'une collectivité à sa création. Le slug lui-même
 * n'est PAS sûr pour un nom d'hôte (accents acceptés, longueur libre) : on
 * dérive, on ne recopie pas.
 */
export function dnsLabelFromSlug(slug: string | null | undefined): string | null {
  const trimEdges = (value: string) => value.replace(/^-+|-+$/g, "");
  const label = trimEdges(
    trimEdges(unaccent(slug ?? "").replace(/[^a-z0-9]+/g, "-")).slice(0, DNS_LABEL_MAX_LENGTH),
  );
  return label === "" ? null : label;
}

/**
 * Sous-domaine qu'une collectivité reçoit pour ce slug dans cette zone, ou
 * `null` quand l'un des deux manque — exactement ce que `provision_root` pose.
 */
export function providedHostname(
  slug: string | null | undefined,
  suffix: string | null | undefined,
): string | null {
  const label = dnsLabelFromSlug(slug);
  const zone = suffix ? normalizeHostname(suffix) : "";
  return label && zone ? `${label}.${zone}` : null;
}

/**
 * Ce domaine est-il un sous-domaine fourni par la plateforme (dans sa zone) ?
 * Sans zone réglée, aucun ne l'est — pas même un qui en aurait l'air.
 */
export function isProvidedDomain(hostname: string, suffix: string | null | undefined): boolean {
  if (!suffix) return false;
  const zone = normalizeHostname(suffix);
  return zone !== "" && hostname.toLowerCase().endsWith(`.${zone}`);
}
