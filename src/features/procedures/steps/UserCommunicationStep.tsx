import * as React from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  AUDIENCE_TRANSLATABLE_FIELDS,
  FAQ_TRANSLATABLE_FIELDS,
  MAX_PROCESSING_TIME,
  PIECE_TRANSLATABLE_FIELDS,
  PROCESSING_TIME_UNITS,
  cleanUserCommunication,
  emptyRequiredPiece,
  emptyUserFaqItem,
  parseUserCommunication,
  processingTimeError,
  requiredPiecesError,
  userFaqError,
  type DelaysConfig,
  type ProcessingTimeUnit,
  type RequiredPiece,
  type UserCommunication,
  type UserFaqItem,
} from "@/features/procedures/userCommunication";
import { attachmentFields, parseFormSchema } from "@/features/procedures/formSchema";
import { enabledAudiences } from "@/features/procedures/requesterFields";
import { FaqEditor } from "@/features/procedures/steps/connaissances/FaqEditor";
import { MarkdownField } from "@/features/procedures/steps/connaissances/MarkdownField";
import { PiecesEditor } from "@/features/procedures/steps/usager/PiecesEditor";
import { AttachmentsRecap, AudienceRecap } from "@/features/procedures/steps/usager/Recaps";
import { TranslationsDisclosure } from "@/features/languages/TranslationsDisclosure";
import { useOrganizationLanguages } from "@/features/languages/useOrganizationLanguages";
import {
  applyTranslations,
  translatedLanguageCodes,
  translationInput,
  translationsForWrite,
  type TranslatableField,
  type TranslationInput,
  type TranslationMap,
} from "@/features/languages/translations";
import type { Procedure } from "@/features/procedures/useProcedures";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Le seul texte de `procedures.translations` que cette étape traduit — et donc
 * le seul qu'elle a le droit d'effacer (dernier argument de
 * `translationsForWrite`). Le libellé et le descriptif court, traduits à l'étape
 * « Descriptif », traversent un enregistrement d'ici sans être touchés.
 */
const USAGER_COLUMN_FIELDS: TranslatableField[] = ["user_description"];

/**
 * Ce que l'étape enregistre : une colonne texte, une colonne JSONB, et la part
 * de `translations` qui lui revient.
 * ⚠️ Les trois partent dans la MÊME mutation (voir `ProcedureEditor`) — un
 * descriptif enregistré sans sa FAQ, ou sans sa traduction, laisserait l'agent
 * devant un écran à moitié sauvegardé sans qu'il puisse le savoir.
 */
export interface UserCommunicationValues {
  /** Colonne `procedures.user_description` (Markdown). `null` quand elle est vide. */
  userDescription: string | null;
  /** Colonne `procedures.user_communication` — traductions de ses textes comprises. */
  config: UserCommunication;
  /**
   * Colonne `procedures.translations` ENTIÈRE, fusionnée avec l'existant : seul
   * `user_description` y est réécrit, dans les seules langues actives.
   */
  translations: TranslationMap;
}

/**
 * Identité d'une ligne À L'ÉCRAN — jamais enregistrée (le parseur ne la relit
 * pas, `cleanUserCommunication` la laisse donc en route).
 *
 * ⚠️ ELLE EXISTE POUR LA TRADUCTION AUTOMATIQUE. La réponse revient plusieurs
 * secondes après le clic : repérée par son index, elle se poserait sur la
 * question qui a pris la place de celle qu'on vient de retirer — une réponse
 * traduite sous une autre question, qu'un agent pressé enregistrerait.
 * Repérée par cette clé, elle retrouve sa ligne, ou ne se pose nulle part.
 */
interface Keyed {
  key: string;
}
type EditablePiece = RequiredPiece & Keyed;
type EditableFaqItem = UserFaqItem & Keyed;
type EditableUserCommunication = Omit<UserCommunication, "attachments" | "faq"> & {
  attachments: { items: EditablePiece[] };
  faq: { items: EditableFaqItem[] };
};

let keySequence = 0;
function freshKey(): string {
  keySequence += 1;
  return `ligne-${keySequence}`;
}

function withKeys(config: UserCommunication): EditableUserCommunication {
  return {
    ...config,
    attachments: { items: config.attachments.items.map((p) => ({ ...p, key: freshKey() })) },
    faq: { items: config.faq.items.map((q) => ({ ...q, key: freshKey() })) },
  };
}

/** Bloc encadré de l'étape — même motif que `KnowledgeBaseStep`. */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border p-5">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Étape « Communication usager » : ce que l'usager lit sur le site de démarches
 * avant de déposer sa demande. Persisté dans `procedures.user_communication`
 * (schéma possédé) **et** dans `procedures.user_description` pour le descriptif.
 *
 * ⚠️ Deux blocs sont en LECTURE SEULE parce qu'ils se règlent ailleurs : les
 * publics admis (étape « Informations demandeur ») et les pièces téléversées
 * (étape « Formulaire »). Les redoubler créerait une seconde source de vérité
 * pour des données déjà publiées au portail.
 *
 * **Traductions** : chaque texte a les siennes, repliées JUSTE SOUS lui — la
 * traduction automatique part du français, et on la demande là où on vient de
 * l'écrire. Deux maisons, un seul geste pour l'agent :
 *  • le descriptif est une COLONNE — sa traduction va dans
 *    `procedures.translations`, par `translationsForWrite` au moment
 *    d'enregistrer (motif de l'étape « Descriptif ») ;
 *  • la note, les pièces et les questions vivent dans le JSON — leur traduction
 *    est posée sur l'entrée elle-même, frappe par frappe (`applyTranslations`,
 *    motif des sections de page du portail), et voyage avec elle.
 */
export function UserCommunicationStep({
  formId,
  procedure,
  onSubmit,
}: {
  formId: string;
  procedure: Procedure;
  onSubmit: (values: UserCommunicationValues) => void;
}) {
  const [config, setConfig] = React.useState<EditableUserCommunication>(() =>
    withKeys(parseUserCommunication(procedure.user_communication)),
  );
  const [userDescription, setUserDescription] = React.useState(
    () => procedure.user_description ?? "",
  );
  // Toutes langues confondues, comme à l'étape « Descriptif » : l'écran
  // n'affiche que les langues actives, l'écriture ne touche qu'à elles.
  const [translations, setTranslations] = React.useState<TranslationInput>(() =>
    translationInput(procedure.translations),
  );
  // Durée en état TEXTE, jamais en nombre : une saisie en cours (« 1 » avant
  // « 12 ») ne doit pas être réécrite sous les doigts — motif `durationText` de
  // l'étape « Descriptif ».
  const [durationText, setDurationText] = React.useState(() =>
    config.delays.processingTimeValue != null ? String(config.delays.processingTimeValue) : "",
  );

  const organizationId = procedure.organization_id ?? undefined;
  // Langues activées par l'organisation principale : elles décident des cases
  // de traduction proposées, et de celles qu'un enregistrement réécrit.
  const { data: enabledLanguages } = useOrganizationLanguages(organizationId);
  const languages = enabledLanguages ?? [];

  const delays: DelaysConfig = {
    processingTimeValue: durationText.trim() ? Number(durationText) : null,
    processingTimeUnit: config.delays.processingTimeUnit,
  };
  const durationError = processingTimeError(delays);
  const piecesError = requiredPiecesError(config.attachments.items);
  const faqError = userFaqError(config.faq.items);

  // Les deux rappels : réglés ailleurs, lus ici.
  const audiences = enabledAudiences(procedure.requester_config);
  const formAttachments = attachmentFields(parseFormSchema(procedure.form_schema));

  /** Une pièce, retrouvée par sa clé — voir `Keyed`. Absente : rien ne se pose. */
  const updatePiece = (key: string, change: (piece: EditablePiece) => EditablePiece) =>
    setConfig((c) => ({
      ...c,
      attachments: { items: c.attachments.items.map((p) => (p.key === key ? change(p) : p)) },
    }));

  const updateFaqItem = (key: string, change: (item: EditableFaqItem) => EditableFaqItem) =>
    setConfig((c) => ({
      ...c,
      faq: { items: c.faq.items.map((q) => (q.key === key ? change(q) : q)) },
    }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Rien de ce qui s'afficherait de travers sur un site public ne part d'ici.
    if (durationError || piecesError || faqError) return;
    onSubmit({
      userDescription: userDescription.trim() ? userDescription : null,
      // Le parseur relit chaque entrée champ par champ : la clé d'écran reste
      // en route, les traductions sont élaguées et les langues vides écartées.
      config: cleanUserCommunication({ ...config, delays }),
      // Fusion avec l'existant : une traduction faite dans une langue depuis
      // désactivée est conservée, le libellé traduit aussi.
      translations: translationsForWrite(
        procedure.translations,
        translations,
        languages,
        USAGER_COLUMN_FIELDS,
      ),
    });
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="flex max-w-5xl flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Communication usager</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ce que l'usager lit sur le site de démarches avant de déposer sa demande.
        </p>
      </div>

      <Section
        title="Descriptif de la démarche"
        description="Le texte de présentation affiché sur la page de la démarche."
      >
        <MarkdownField
          id="usager-description"
          label="Descriptif de la démarche"
          hint="Le résumé d'une ligne, lui, se saisit à l'étape « Descriptif »."
          value={userDescription}
          onChange={setUserDescription}
          rows={10}
          placeholder="À qui s'adresse cette démarche, ce qu'elle permet d'obtenir, comment elle se déroule…"
        />

        <TranslationsDisclosure
          translated={translatedLanguageCodes(translations, USAGER_COLUMN_FIELDS)}
          enabled={languages}
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
          idPrefix="usager-description-translation"
          organizationId={organizationId}
          fields={[
            {
              key: "user_description",
              label: "Descriptif de la démarche",
              source: userDescription,
              multiline: true,
              rows: 8,
            },
          ]}
          kind="procedure"
          reviewHint="relisez avant d'enregistrer — la mise en forme Markdown est conservée."
        />
      </Section>

      <Section
        title="Délais"
        description="Le temps de réponse habituel, annoncé à l'usager au moment où il dépose."
      >
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field
            label="Durée habituelle d'instruction"
            htmlFor="usager-processing-time"
            hint="Combien de temps la collectivité met à répondre. À ne pas confondre avec la durée de saisie du formulaire (étape « Descriptif »). Vide : aucun délai annoncé."
            error={durationError ?? undefined}
          >
            <Input
              id="usager-processing-time"
              type="number"
              min={1}
              max={MAX_PROCESSING_TIME}
              step={1}
              value={durationText}
              onChange={(e) => setDurationText(e.target.value)}
              placeholder="Ex. 3"
            />
          </Field>

          <Field label="Unité" htmlFor="usager-processing-unit">
            <select
              id="usager-processing-unit"
              value={config.delays.processingTimeUnit}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  delays: {
                    ...c.delays,
                    processingTimeUnit: e.target.value as ProcessingTimeUnit,
                  },
                }))
              }
              className={selectClass}
            >
              {PROCESSING_TIME_UNITS.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {/*
          Pas de traduction ici, et c'est voulu : la durée est STRUCTURÉE
          (valeur + unité), et le portail rend « 3 semaines » dans sa propre
          langue. Il n'y a pas de texte à traduire.
        */}
      </Section>

      <Section
        title="Public concerné"
        description="Qui peut effectuer cette démarche, et ce qu'il faut en préciser à l'usager."
      >
        <AudienceRecap audiences={audiences} />

        <Field
          label="Précision sur le public concerné"
          htmlFor="usager-audience-note"
          hint="Cette précision s'affiche à l'usager ; elle ne filtre rien. Pour restreindre réellement les publics, c'est l'étape « Informations demandeur »."
        >
          <textarea
            id="usager-audience-note"
            value={config.audience.note}
            onChange={(e) => {
              const note = e.target.value;
              setConfig((c) => ({ ...c, audience: { ...c.audience, note } }));
            }}
            rows={3}
            placeholder="Ex. Réservée aux personnes résidant sur la commune."
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Field>

        <TranslationsDisclosure
          translated={translatedLanguageCodes(
            config.audience.translations,
            AUDIENCE_TRANSLATABLE_FIELDS,
          )}
          enabled={languages}
          value={config.audience.translations}
          onChange={(code, field, value) =>
            setConfig((c) => ({
              ...c,
              audience: {
                ...c.audience,
                translations: applyTranslations(
                  c.audience.translations,
                  { [code]: { [field]: value } },
                  AUDIENCE_TRANSLATABLE_FIELDS,
                ),
              },
            }))
          }
          onApply={(patch) =>
            setConfig((c) => ({
              ...c,
              audience: {
                ...c.audience,
                translations: applyTranslations(
                  c.audience.translations,
                  patch,
                  AUDIENCE_TRANSLATABLE_FIELDS,
                ),
              },
            }))
          }
          idPrefix="usager-note-translation"
          organizationId={organizationId}
          fields={[
            {
              key: "note",
              label: "Précision sur le public concerné",
              source: config.audience.note,
              multiline: true,
            },
          ]}
          kind="user_communication"
        />
      </Section>

      <Section
        title="Pièces demandées"
        description="Ce dont l'usager doit se munir, tel qu'on le lui annonce."
      >
        <PiecesEditor<EditablePiece>
          label="Pièces à fournir"
          hint="Texte d'annonce : une pièce peut se déposer dans le formulaire ou se présenter au guichet."
          value={config.attachments.items}
          onChange={(items) => setConfig((c) => ({ ...c, attachments: { items } }))}
          error={piecesError ?? undefined}
          createItem={() => ({ ...emptyRequiredPiece(), key: freshKey() })}
          itemKey={(piece) => piece.key}
          renderItemFooter={(piece) => (
            <TranslationsDisclosure
              translated={translatedLanguageCodes(piece.translations, PIECE_TRANSLATABLE_FIELDS)}
              enabled={languages}
              value={piece.translations}
              onChange={(code, field, value) =>
                updatePiece(piece.key, (p) => ({
                  ...p,
                  translations: applyTranslations(
                    p.translations,
                    { [code]: { [field]: value } },
                    PIECE_TRANSLATABLE_FIELDS,
                  ),
                }))
              }
              onApply={(patch) =>
                updatePiece(piece.key, (p) => ({
                  ...p,
                  translations: applyTranslations(p.translations, patch, PIECE_TRANSLATABLE_FIELDS),
                }))
              }
              idPrefix={`usager-piece-${piece.key}`}
              organizationId={organizationId}
              fields={[
                { key: "label", label: "Intitulé", source: piece.label },
                { key: "description", label: "Précision", source: piece.description },
              ]}
              kind="user_communication"
            />
          )}
        />

        <AttachmentsRecap fields={formAttachments} />
      </Section>

      <Section
        title="Questions fréquentes"
        description="Les questions que l'usager se pose avant de déposer sa demande."
      >
        <FaqEditor<EditableFaqItem>
          label="FAQ usager"
          hint="Publiée sur le site de démarches. Les questions destinées à l'agent restent à l'étape « Base de connaissances »."
          value={config.faq.items}
          onChange={(items) => setConfig((c) => ({ ...c, faq: { items } }))}
          addLabel="Ajouter une question"
          createItem={() => ({ ...emptyUserFaqItem(), key: freshKey() })}
          itemKey={(item) => item.key}
          renderItemFooter={(item) => (
            <TranslationsDisclosure
              translated={translatedLanguageCodes(item.translations, FAQ_TRANSLATABLE_FIELDS)}
              enabled={languages}
              value={item.translations}
              onChange={(code, field, value) =>
                updateFaqItem(item.key, (q) => ({
                  ...q,
                  translations: applyTranslations(
                    q.translations,
                    { [code]: { [field]: value } },
                    FAQ_TRANSLATABLE_FIELDS,
                  ),
                }))
              }
              onApply={(patch) =>
                updateFaqItem(item.key, (q) => ({
                  ...q,
                  translations: applyTranslations(q.translations, patch, FAQ_TRANSLATABLE_FIELDS),
                }))
              }
              idPrefix={`usager-faq-${item.key}`}
              organizationId={organizationId}
              fields={[
                { key: "question", label: "Question", source: item.question },
                { key: "answer", label: "Réponse", source: item.answer, multiline: true },
              ]}
              kind="user_communication"
            />
          )}
        />
        {faqError ? <p className="text-xs text-destructive">{faqError}</p> : null}
      </Section>
    </form>
  );
}
