import * as React from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  cleanCommunicationConfig,
  parseCommunicationConfig,
  publicationPeriodError,
  replyViaClaraUnavailableReason,
  type CommunicationConfig,
  type CommunicationDocument,
  type DocumentsConfig,
  type VisibilityConfig,
} from "@/features/procedures/communication";
import { DocumentsBlock } from "@/features/procedures/steps/communication/DocumentsBlock";
import { useDocumentTemplatesForOrg } from "@/features/documents/useDocumentTemplates";
import { useRootApplications } from "@/features/organizations/useFreeMail";
import type { Procedure } from "@/features/procedures/useProcedures";

/** Ligne « libellé + explication » à gauche, commutateur à droite. */
function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  note,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
  /** Pourquoi le commutateur est inactif (affiché sous l'explication). */
  note?: string | null;
}) {
  const noteId = note ? `${id}-note` : undefined;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className={disabled ? "opacity-60" : undefined}>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        {note ? (
          <p id={noteId} role="note" className="mt-1 text-xs text-muted-foreground">
            {note}
          </p>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={label}
        aria-describedby={noteId}
        disabled={disabled}
      />
    </div>
  );
}

/**
 * Étape « Publication » : où et quand la démarche est proposée, et ce que
 * l'agent peut produire depuis elle. Deux blocs, « Visibilité » et
 * « Documents et courriers » — persistés dans `procedures.communication_config`
 * (schéma possédé), exposés par l'API publique et exploités en aval (portail
 * usagers, Iris).
 *
 * ⚠️ Le LIBELLÉ de l'étape est « Publication » depuis le 2026-09-18, mais la
 * clé, le fichier et la colonne restent `communication` : la clé suit la
 * colonne, le libellé suit l'agent. Sans ce renommage, deux entrées
 * « Communication » se seraient suivies dans le stepper — celle-ci et
 * « Communication usager », qui ne se recouvrent en rien.
 */
export function CommunicationStep({
  formId,
  procedure,
  onSubmit,
}: {
  formId: string;
  procedure: Procedure;
  onSubmit: (config: CommunicationConfig) => void;
}) {
  const [config, setConfig] = React.useState<CommunicationConfig>(() =>
    parseCommunicationConfig(procedure.communication_config),
  );
  const { visibility, documents, replyLetters } = config;
  const periodError = publicationPeriodError(visibility);

  // Le catalogue est celui de l'organisation principale porteuse de la démarche.
  const { data: templates, isLoading: loadingTemplates } = useDocumentTemplatesForOrg(
    procedure.organization_id,
  );

  function setVisibility<K extends keyof VisibilityConfig>(key: K, value: VisibilityConfig[K]) {
    setConfig((c) => ({ ...c, visibility: { ...c.visibility, [key]: value } }));
  }

  function setDocuments<K extends keyof DocumentsConfig>(key: K, value: DocumentsConfig[K]) {
    setConfig((c) => ({ ...c, documents: { ...c.documents, [key]: value } }));
  }

  // Le circuit Clara n'existe que si la RACINE est abonnée à Clara. Tant que
  // l'abonnement n'est pas connu, le commutateur reste inactif (au doute, fermé) ;
  // sans abonnement il est grisé mais garde sa valeur (le réglage gouverne
  // l'usage, pas la donnée : rien n'est effacé si Clara revient).
  const { data: rootApplications } = useRootApplications(procedure.organization_id ?? undefined);
  const claraUnavailable = rootApplications
    ? replyViaClaraUnavailableReason(rootApplications)
    : null;
  const claraToggleDisabled = !rootApplications || claraUnavailable !== null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Une période impossible ne partirait jamais en publication : on bloque ici.
    if (periodError) return;
    onSubmit(cleanCommunicationConfig(config));
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="flex max-w-5xl flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Publication</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Où et quand la démarche est proposée, et ce que l'agent peut produire depuis elle.
        </p>
      </div>

      <section className="flex flex-col gap-4 rounded-xl border border-border p-5">
        <div>
          <h3 className="text-base font-semibold">Visibilité</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Où et quand la démarche est proposée aux usagers.
          </p>
        </div>

        <ToggleRow
          id="comm-portal-visible"
          label="Visible sur le portail"
          description="La démarche est proposée aux usagers sur le portail en ligne."
          checked={visibility.portalVisible}
          onCheckedChange={(v) => setVisibility("portalVisible", v)}
        />

        <ToggleRow
          id="comm-period-enabled"
          label="Limiter la publication à une période"
          description="En dehors de la période, la démarche n'est pas proposée aux usagers."
          checked={visibility.publicationPeriodEnabled}
          onCheckedChange={(v) => setVisibility("publicationPeriodEnabled", v)}
        />

        {visibility.publicationPeriodEnabled ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Date de début de publication"
              htmlFor="comm-publication-start"
              hint="Jour inclus. Vide : aucune date de début."
            >
              <Input
                id="comm-publication-start"
                type="date"
                value={visibility.publicationStart ?? ""}
                onChange={(e) => setVisibility("publicationStart", e.target.value || null)}
              />
            </Field>

            <Field
              label="Date de fin de publication"
              htmlFor="comm-publication-end"
              hint="Jour inclus. Vide : aucune date de fin."
              error={periodError ?? undefined}
            >
              <Input
                id="comm-publication-end"
                type="date"
                value={visibility.publicationEnd ?? ""}
                onChange={(e) => setVisibility("publicationEnd", e.target.value || null)}
              />
            </Field>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border p-5">
        <div>
          <h3 className="text-base font-semibold">Documents et courriers</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Ce que l'agent pourra produire depuis cette démarche, choisi dans le catalogue de
            l'organisation.
          </p>
        </div>

        <ToggleRow
          id="comm-documents-restrict"
          label="Restreindre la visibilité selon l'issue"
          description="Chaque document n'est proposé que pour les demandes traitées positivement, négativement, ou toujours."
          checked={documents.restrictVisibility}
          onCheckedChange={(v) => setDocuments("restrictVisibility", v)}
        />

        <DocumentsBlock
          templates={templates ?? []}
          loading={loadingTemplates}
          documents={documents.documents}
          letters={documents.letters}
          restrictVisibility={documents.restrictVisibility}
          onChangeDocuments={(next: CommunicationDocument[]) => setDocuments("documents", next)}
          onChangeLetters={(next: CommunicationDocument[]) => setDocuments("letters", next)}
        />

        <ToggleRow
          id="comm-reply-clara"
          label="Courriers de réponse usager à traiter comme un courrier sortant Clara"
          description="Dans Iris, l'agent rédige le courrier de réponse sans pouvoir l'envoyer : il est déposé dans Clara comme courrier sortant, lié à la demande, qui reste « Réponse en validation » jusqu'à son envoi par Clara."
          checked={replyLetters.claraOutbound}
          onCheckedChange={(v) => setConfig((c) => ({ ...c, replyLetters: { claraOutbound: v } }))}
          disabled={claraToggleDisabled}
          note={claraUnavailable}
        />
      </section>
    </form>
  );
}
