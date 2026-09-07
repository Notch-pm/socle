import * as React from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { parseKeywords } from "@/features/procedures/keywords";
import { useCategoriesQuery } from "@/features/categories/useCategories";
import { TranslationFields } from "@/features/languages/TranslationFields";
import { useOrganizationLanguages } from "@/features/languages/useOrganizationLanguages";
import {
  translationInput,
  translationsForWrite,
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
  keywords: string[];
  short_description: string | null;
  input_duration_minutes: number | null;
  order_index: number;
  /** Libellé traduit dans les langues actives de l'organisation principale. */
  translations: TranslationMap;
}

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      category_id: categoryId,
      type,
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

      <TranslationFields
        enabled={enabledLanguages ?? []}
        value={translations}
        onChange={(code, value) => setTranslations((current) => ({ ...current, [code]: value }))}
        idPrefix="proc-translation"
        className="sm:col-span-2"
        organizationId={organizationId}
        sourceLabel={name}
        kind="procedure"
      />

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
