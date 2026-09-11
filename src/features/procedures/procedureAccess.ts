/**
 * Conditions d'accès d'une démarche : **libre** (n'importe quel visiteur la
 * dépose) ou réservée aux **usagers authentifiés** (il faut être connecté à son
 * espace). Logique pure (aucune dépendance React/Supabase), persistée dans
 * `procedures.access_mode`, réglée à l'étape « Descriptif ».
 *
 * ⚠️ **Ce n'est pas une quatrième règle de publication.** Les trois notions qui
 * décident de ce qui est proposé se cumulent déjà (`status`,
 * `organization_procedures.is_enabled`, `communication_config.visibility`) ;
 * celle-ci ne s'y ajoute pas. Une démarche réservée reste au catalogue du
 * portail et doit s'y voir — c'est en la lisant que l'usager apprend qu'il doit
 * se connecter. L'en retirer reviendrait à la cacher à ceux-là mêmes qui ont un
 * compte.
 *
 * ⚠️ Le Socle **enregistre et publie**, il ne garde aucune porte (motif de la
 * charte graphique et de l'étape Communication) : c'est le portail qui demande
 * la connexion, et l'application qui instruit qui refuse un dépôt anonyme. Une
 * démarche réservée est donc pour l'instant déposable comme les autres, tant
 * qu'un consommateur ne lit pas le champ.
 */

export type ProcedureAccessMode = "libre" | "authentifie";

/**
 * Accès d'une démarche qu'on vient de créer, et de toutes celles d'avant la
 * colonne : **libre**. C'est ce qui était vrai — le portail dépose sans compte —
 * et le défaut inverse aurait fermé d'un coup un catalogue entier que personne
 * n'avait déclaré fermé.
 */
export const DEFAULT_PROCEDURE_ACCESS_MODE: ProcedureAccessMode = "libre";

export const PROCEDURE_ACCESS_MODES: {
  value: ProcedureAccessMode;
  label: string;
  /** Ce que le choix change pour l'usager, en une phrase. */
  hint: string;
}[] = [
  {
    value: "libre",
    label: "Accès libre",
    hint: "N'importe quel usager peut déposer la démarche, sans compte.",
  },
  {
    value: "authentifie",
    label: "Usagers authentifiés",
    hint: "L'usager doit être connecté à son espace pour déposer la démarche.",
  },
];

export const PROCEDURE_ACCESS_MODE_LABELS: Record<ProcedureAccessMode, string> = {
  libre: "Accès libre",
  authentifie: "Usagers authentifiés",
};

/**
 * Accès lisible depuis une colonne texte (le CHECK en base le garantit, mais la
 * colonne reste un `text` côté types générés).
 *
 * ⚠️ Toute valeur inattendue retombe sur **libre** — l'inverse du doute de
 * `parseProcedureStatus`, et pour la même raison : on n'affirme pas à la place
 * de la collectivité. Là-bas le doute ne publie rien ; ici il ne **ferme** rien,
 * parce qu'une restriction que nul n'a demandée empêcherait des dépôts qui
 * passaient la veille.
 */
export function parseProcedureAccessMode(raw: unknown): ProcedureAccessMode {
  return raw === "authentifie" ? "authentifie" : DEFAULT_PROCEDURE_ACCESS_MODE;
}

/** La démarche exige-t-elle un usager connecté ? */
export function requiresAuthentication(raw: unknown): boolean {
  return parseProcedureAccessMode(raw) === "authentifie";
}
