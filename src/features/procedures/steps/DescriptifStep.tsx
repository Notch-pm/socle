import * as React from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { parseKeywords } from "@/features/procedures/keywords";
import {
  PROCEDURE_ACCESS_MODES,
  parseProcedureAccessMode,
  type ProcedureAccessMode,
} from "@/features/procedures/procedureAccess";
import { useCategoriesQuery } from "@/features/categories/useCategories";
import { TranslationFields } from "@/features/languages/TranslationFields";
import { useOrganizationLanguages } from "@/features/languages/useOrganizationLanguages";
import {
  translationInput,
  translationsForWrite,
  type TranslatableField,
  type TranslationInput,
  type TranslationMap,
} from "@/features/languages/translations";
import {
  PROCEDURE_TYPES,
  useNextProcedureRank,
  type Procedure,
  type ProcedureType,
} from "@/features/procedures/useProcedures";

export interface DescriptifValues {
  name: string;
  category_id: string;
  type: ProcedureType;
  /**
   * Conditions d'accès : `libre` ou `authentifie`. Ne décide pas de la
   * publication — voir `procedureAccess.ts`.
   */
  access_mode: ProcedureAccessMode;
  keywords: string[];
  short_description: string | null;
  input_duration_minutes: number | null;
  order_index: number;
  /**
   * Libellé **et descriptif court** traduits dans les langues actives de
   * l'organisation principale.
   */
  translations: TranslationMap;
}

/**
 * Les deux textes que cette étape traduit — et les deux seuls qu'elle a le
 * droit d'effacer (dernier argument de `translationsForWrite`). Un champ traduit
 * ailleurs un jour ne sera pas emporté par un enregistrement d'ici.
 */
const PROCEDURE_TRANSLATABLE_FIELDS: TranslatableField[] = ["name", "short_description"];

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function DescriptifStep({
  formId,
  organizationId,
  procedure,
  onSubmit,
}: {
  formId: string;
  organizationId: string;
  procedure: Procedure | null;
  onSubmit: (values: DescriptifValues) => void;
}) {
  const isEdit = Boolean(procedure);
  const { data: categories, isLoading: loadingCategories } = useCategoriesQuery();
  // Rang par défaut (création uniquement).
  const { data: nextRank } = useNextProcedureRank(isEdit ? undefined : organizationId);
  // Langues activées par l'organisation principale : ce sont elles qui décident
  // des champs de traduction proposés.
  const { data: enabledLanguages } = useOrganizationLanguages(organizationId);

  const orgCategories = (categories ?? []).filter((c) => c.organization_id === organizationId);

  const [name, setName] = React.useState(procedure?.name ?? "");
  const [categoryId, setCategoryId] = React.useState(procedure?.category_id ?? "");
  const [type, setType] = React.useState<ProcedureType>(
    (procedure?.type as ProcedureType) ?? "externe",
  );
  const [accessMode, setAccessMode] = React.useState<ProcedureAccessMode>(() =>
    parseProcedureAccessMode(procedure?.access_mode),
  );
  const [keywordsText, setKeywordsText] = React.useState(procedure?.keywords?.join(", ") ?? "");
  const [shortDescription, setShortDescription] = React.useState(procedure?.short_description ?? "");
  const [durationText, setDurationText] = React.useState(
    procedure?.input_duration_minutes != null ? String(procedure.input_duration_minutes) : "",
  );
  const [rankText, setRankText] = React.useState(
    procedure?.order_index != null ? String(procedure.order_index) : "",
  );
  const [translations, setTranslations] = React.useState<TranslationInput>(() =>
    translationInput(procedure?.translations),
  );

  // En création, pré-remplir le rang dès que le prochain rang est connu.
  React.useEffect(() => {
    if (!isEdit && rankText === "" && nextRank != null) setRankText(String(nextRank));
  }, [isEdit, rankText, nextRank]);

  const noCategory = !loadingCategories && orgCategories.length === 0;
  // Le <select> est `required` : tant que la catégorie déjà choisie n'est pas
  // (encore) parmi les options chargées — requête en vol au premier rendu,
  // catégorie supprimée depuis — la validation HTML5 du navigateur bloque
  // silencieusement la soumission du formulaire (aucune erreur affichée,
  // « Enregistrer et continuer » ne fait rien). On garde donc une option pour
  // la valeur courante tant qu'elle n'a pas de correspondance dans la liste.
  const currentCategoryMissing =
    categoryId !== "" && !orgCategories.some((c) => c.id === categoryId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      category_id: categoryId,
      type,
      access_mode: accessMode,
      keywords: parseKeywords(keywordsText),
      short_description: shortDescription.trim() || null,
      input_duration_minutes: durationText.trim() ? Number(durationText) : null,
      order_index: rankText.trim() ? Number(rankText) : (nextRank ?? 0),
      // Fusion avec l'existant : une traduction faite dans une langue depuis
      // désactivée est conservée (voir `translationsForWrite`).
      translations: translationsForWrite(
        procedure?.translations,
        translations,
        enabledLanguages ?? [],
        PROCEDURE_TRANSLATABLE_FIELDS,
      ),
    });
  }

  return (
    <form
      id={formId}
      onSubmit={handleSubmit}
      className="grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <Field label="Libellé de la démarche" htmlFor="proc-name" required className="sm:col-span-2">
        <Input
          id="proc-name"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex. Demande d'acte de naissance"
        />
      </Field>

      <Field
        label="Catégorie"
        htmlFor="proc-category"
        required
        hint={noCategory ? "Aucune catégorie pour cette organisation." : undefined}
      >
        <select
          id="proc-category"
          required
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={selectClass}
        >
          <option value="" disabled>
            {loadingCategories ? "Chargement…" : "Sélectionner une catégorie"}
          </option>
          {currentCategoryMissing ? (
            <option value={categoryId} disabled>
              {loadingCategories ? "Chargement…" : "Catégorie introuvable"}
            </option>
          ) : null}
          {orgCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Type" htmlFor="proc-type" required>
        <select
          id="proc-type"
          required
          value={type}
          onChange={(e) => setType(e.target.value as ProcedureType)}
          className={selectClass}
        >
          {PROCEDURE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      {/*
        Qui peut déposer la démarche. Placé avec « Type » parce que c'est de la
        même nature : ce que la démarche EST, avant ce qu'elle demande.
        ⚠️ Ce réglage ne retire rien du catalogue du portail — une démarche
        réservée doit s'y voir, c'est là que l'usager apprend qu'il doit se
        connecter (voir `procedureAccess.ts`).
      */}
      <Field
        label="Accès"
        htmlFor="proc-access"
        required
        hint={PROCEDURE_ACCESS_MODES.find((mode) => mode.value === accessMode)?.hint}
        className="sm:col-span-2"
      >
        <select
          id="proc-access"
          required
          value={accessMode}
          onChange={(e) => setAccessMode(e.target.value as ProcedureAccessMode)}
          className={selectClass}
        >
          {PROCEDURE_ACCESS_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Mots-clés (recherche)"
        htmlFor="proc-keywords"
        hint="Séparés par une virgule — ex. naissance, acte, état civil"
        className="sm:col-span-2"
      >
        <Input
          id="proc-keywords"
          value={keywordsText}
          onChange={(e) => setKeywordsText(e.target.value)}
          placeholder="naissance, acte, état civil"
        />
      </Field>

      <Field label="Descriptif court" htmlFor="proc-desc" className="sm:col-span-2">
        <textarea
          id="proc-desc"
          value={shortDescription}
          onChange={(e) => setShortDescription(e.target.value)}
          rows={3}
          placeholder="Résumé de la démarche à destination des usagers."
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>

      {/*
        Sous les deux textes qu'il traduit, jamais avant : la traduction
        automatique part du français, et un agent à qui l'on demande les
        traductions d'un descriptif qu'il n'a pas encore écrit ne peut que les
        laisser vides.
      */}
      <TranslationFields
        enabled={enabledLanguages ?? []}
        value={translations}
        onChange={(code, field, value) =>
          setTranslations((current) => ({
            ...current,
            [code]: { ...current[code], [field]: value },
          }))
        }
        onApply={(patch) =>
          setTranslations((current) => {
            const next = { ...current };
            for (const [code, entry] of Object.entries(patch)) {
              next[code] = { ...next[code], ...entry };
            }
            return next;
          })
        }
        idPrefix="proc-translation"
        className="sm:col-span-2"
        organizationId={organizationId}
        fields={[
          { key: "name", label: "Libellé", source: name },
          {
            key: "short_description",
            label: "Descriptif court",
            source: shortDescription,
            multiline: true,
          },
        ]}
        kind="procedure"
      />

      <Field label="Durée de saisie (minutes)" htmlFor="proc-duration">
        <Input
          id="proc-duration"
          type="number"
          min={0}
          step={1}
          value={durationText}
          onChange={(e) => setDurationText(e.target.value)}
          placeholder="Ex. 10"
        />
      </Field>

      <Field label="Rang" htmlFor="proc-rank" hint="Ordre d'affichage — par défaut, à la suite.">
        <Input
          id="proc-rank"
          type="number"
          step={1}
          value={rankText}
          onChange={(e) => setRankText(e.target.value)}
        />
      </Field>

      <p className="text-xs text-muted-foreground sm:col-span-2">
        Les champs marqués d'un <span className="text-destructive">*</span> sont obligatoires.
      </p>
    </form>
  );
}
