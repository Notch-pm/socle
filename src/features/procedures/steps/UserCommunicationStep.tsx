import * as React from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  MAX_PROCESSING_TIME,
  PROCESSING_TIME_UNITS,
  cleanUserCommunication,
  parseUserCommunication,
  processingTimeError,
  requiredPiecesError,
  userFaqError,
  type DelaysConfig,
  type ProcessingTimeUnit,
  type UserCommunication,
} from "@/features/procedures/userCommunication";
import { attachmentFields, parseFormSchema } from "@/features/procedures/formSchema";
import { enabledAudiences } from "@/features/procedures/requesterFields";
import { FaqEditor } from "@/features/procedures/steps/connaissances/FaqEditor";
import { MarkdownField } from "@/features/procedures/steps/connaissances/MarkdownField";
import { PiecesEditor } from "@/features/procedures/steps/usager/PiecesEditor";
import { AttachmentsRecap, AudienceRecap } from "@/features/procedures/steps/usager/Recaps";
import type { Procedure } from "@/features/procedures/useProcedures";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Ce que l'étape enregistre : une colonne texte **et** une colonne JSONB.
 * ⚠️ Les deux partent dans la MÊME mutation (voir `ProcedureEditor`) — un
 * descriptif enregistré sans sa FAQ, ou l'inverse, laisserait l'agent devant un
 * écran à moitié sauvegardé sans qu'il puisse le savoir.
 */
export interface UserCommunicationValues {
  /** Colonne `procedures.user_description` (Markdown). `null` quand elle est vide. */
  userDescription: string | null;
  /** Colonne `procedures.user_communication`. */
  config: UserCommunication;
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
  const [config, setConfig] = React.useState<UserCommunication>(() =>
    parseUserCommunication(procedure.user_communication),
  );
  const [userDescription, setUserDescription] = React.useState(
    () => procedure.user_description ?? "",
  );
  // Durée en état TEXTE, jamais en nombre : une saisie en cours (« 1 » avant
  // « 12 ») ne doit pas être réécrite sous les doigts — motif `durationText` de
  // l'étape « Descriptif ».
  const [durationText, setDurationText] = React.useState(() =>
    config.delays.processingTimeValue != null ? String(config.delays.processingTimeValue) : "",
  );

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Rien de ce qui s'afficherait de travers sur un site public ne part d'ici.
    if (durationError || piecesError || faqError) return;
    onSubmit({
      userDescription: userDescription.trim() ? userDescription : null,
      config: cleanUserCommunication({ ...config, delays }),
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
            onChange={(e) =>
              setConfig((c) => ({ ...c, audience: { note: e.target.value } }))
            }
            rows={3}
            placeholder="Ex. Réservée aux personnes résidant sur la commune."
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Field>
      </Section>

      <Section
        title="Pièces demandées"
        description="Ce dont l'usager doit se munir, tel qu'on le lui annonce."
      >
        <PiecesEditor
          label="Pièces à fournir"
          hint="Texte d'annonce : une pièce peut se déposer dans le formulaire ou se présenter au guichet."
          value={config.attachments.items}
          onChange={(items) => setConfig((c) => ({ ...c, attachments: { items } }))}
          error={piecesError ?? undefined}
        />

        <AttachmentsRecap fields={formAttachments} />
      </Section>

      <Section
        title="Questions fréquentes"
        description="Les questions que l'usager se pose avant de déposer sa demande."
      >
        <FaqEditor
          label="FAQ usager"
          hint="Publiée sur le site de démarches. Les questions destinées à l'agent restent à l'étape « Base de connaissances »."
          value={config.faq.items}
          onChange={(items) => setConfig((c) => ({ ...c, faq: { items } }))}
          addLabel="Ajouter une question"
        />
        {faqError ? <p className="text-xs text-destructive">{faqError}</p> : null}
      </Section>
    </form>
  );
}
