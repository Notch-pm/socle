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
      return "« localhost » n'est pas un domaine de collectivité. En développement, le portail simule un domaine réel (voir PORTAL_DEV_DOMAIN_SUFFIX).";
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
