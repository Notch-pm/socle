import * as React from "react";
import { AUDIENCES, type Audience } from "@/features/procedures/requesterFields";
import type { AttachmentField } from "@/features/procedures/formSchema";

/**
 * Encadré de rappel : ce qui est réglé AILLEURS et qu'on ne redouble pas ici.
 * Volontairement sans aucun contrôle de saisie — c'est ce qui le distingue d'un
 * bloc de l'étape, et un test l'épingle.
 */
function Recap({
  title,
  source,
  children,
}: {
  title: string;
  source: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3">
      <p className="text-sm font-medium">{title}</p>
      {children}
      <p className="mt-2 text-xs text-muted-foreground">{source}</p>
    </div>
  );
}

/**
 * Les publics admis, en LECTURE SEULE.
 *
 * ⚠️ Ils se règlent à l'étape « Informations demandeur » (`requester_config`) et
 * sont publiés en `PortalProcedure.audiences` — c'est sur eux que le portail
 * filtre (« Je suis… »). Un second réglage ici ferait deux vérités pour un même
 * filtre ; la note éditoriale saisie juste en dessous, elle, ne filtre rien.
 */
export function AudienceRecap({ audiences }: { audiences: readonly Audience[] }) {
  const labels = AUDIENCES.filter((a) => audiences.includes(a.key)).map((a) => a.label);

  return (
    <Recap
      title="Publics autorisés à effectuer cette démarche"
      source="Se règlent à l'étape « Informations demandeur »."
    >
      {labels.length ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {labels.map((label) => (
            <li
              key={label}
              className="rounded-full bg-background px-2.5 py-0.5 text-xs font-medium text-foreground ring-1 ring-border"
            >
              {label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          Aucun public activé pour l'instant.
        </p>
      )}
    </Recap>
  );
}

/**
 * Les pièces que l'usager TÉLÉVERSE, en LECTURE SEULE.
 *
 * ⚠️ À ne pas confondre avec la liste qu'on ANNONCE (saisie au-dessus) : celle-ci
 * vient du formulaire et est servie au portail dans `form_schema`. Elle est
 * rappelée ici pour que l'agent voie l'écart entre ce qu'il annonce et ce que le
 * formulaire collecte — pas pour qu'il la recopie.
 */
export function AttachmentsRecap({ fields }: { fields: readonly AttachmentField[] }) {
  return (
    <Recap
      title="Pièces téléversées dans le formulaire"
      source="Se règlent à l'étape « Formulaire »."
    >
      {fields.length ? (
        <ul className="mt-1.5 flex flex-col gap-1">
          {fields.map((field) => (
            <li key={field.id} className="text-sm">
              {field.label || "Pièce sans intitulé"}
              <span className="ml-1.5 text-xs text-muted-foreground">
                {field.requiredIf
                  ? "selon conditions"
                  : field.required
                    ? "obligatoire"
                    : "facultative"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          Le formulaire ne demande aucune pièce.
        </p>
      )}
    </Recap>
  );
}
