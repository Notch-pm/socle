import * as React from "react";
import { Info, Loader2, MessageCircleQuestion } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MarkdownField } from "@/features/procedures/steps/connaissances/MarkdownField";
import { FaqEditor } from "@/features/procedures/steps/connaissances/FaqEditor";
import { OpeningHoursEditor } from "@/features/organizations/OpeningHoursEditor";
import {
  MAX_USER_INFO_DESCRIPTION_LENGTH,
  MAX_USER_INFO_FAQ,
  MAX_USER_INFO_HOURS_NOTES_LENGTH,
  dayDraftErrors,
  fromDayDrafts,
  toDayDrafts,
  type DayHoursDraft,
  type OrganizationUserInfo,
} from "@/features/organizations/userInfo";
import { useSaveUserInfo, useUserInfo } from "@/features/organizations/useUserInfo";
import type { Organization } from "@/features/superadmin/organizations/useOrganizationsAdmin";

export const USER_INFO_INTERNAL_SERVICE_MESSAGE =
  "Cet organisme est un service interne : il ne s'affiche pas sur le site de démarches, et ces informations n'y sont pas publiées.";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Informations à destination des usagers d'un organisme — composant partagé
 * par les deux zones (onglet d'`OrganizationEditorPage` côté admin, section
 * d'`OrgSettingsPage` côté superadmin), comme `AgentGuidanceSection`.
 *
 * Contrairement aux recommandations aux agents, le réglage vit sur **toute**
 * organisation : chaque mairie annexe a ses horaires. Et il est **public** :
 * enregistrer, c'est publier — l'écran le dit avant qu'on écrive.
 */
export function UserInfoSection({ organization }: { organization: Organization }) {
  const { data: stored, isLoading } = useUserInfo(organization.id);
  const save = useSaveUserInfo(organization.id);

  const [draft, setDraft] = React.useState<OrganizationUserInfo | null>(null);
  // Les horaires se saisissent sur sept lignes qui tolèrent des cases vides ;
  // ils ne rejoignent le contrat qu'à l'enregistrement, une fois validés.
  const [hours, setHours] = React.useState<DayHoursDraft[]>([]);
  // Les erreurs ne s'affichent qu'après une tentative d'enregistrement.
  const [showErrors, setShowErrors] = React.useState(false);

  // Une fois les informations enregistrées connues, elles amorcent le formulaire.
  React.useEffect(() => {
    if (stored && draft === null) {
      setDraft(stored.info);
      setHours(toDayDrafts(stored.info.openingHours));
    }
  }, [stored, draft]);

  if (isLoading || draft === null) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const patch = (next: Partial<OrganizationUserInfo>) => {
    setDraft((current) => ({ ...(current ?? draft), ...next }));
    save.reset();
  };

  const hoursErrors = dayDraftErrors(hours);
  const hasHoursErrors = Object.keys(hoursErrors).length > 0;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (hasHoursErrors) {
          setShowErrors(true);
          return;
        }
        save.mutate({ ...draft, openingHours: fromDayDrafts(hours) });
      }}
      className="flex flex-col gap-6"
    >
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <MessageCircleQuestion className="size-5 text-primary" />
            <div>
              <CardTitle className="text-base">Informations à destination des usagers</CardTitle>
              <CardDescription>
                Ce que cet organisme dit au public : présentation, horaires d'accueil, questions
                fréquentes. Le site de démarches les affiche et son assistant IA s'en sert pour
                répondre aux usagers. Tout ce qui est écrit ici est public, dès l'enregistrement.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {organization.is_internal_service ? (
            <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" />
              {USER_INFO_INTERNAL_SERVICE_MESSAGE}
            </p>
          ) : null}
          <MarkdownField
            id="user-info-description"
            label="Descriptif"
            hint="Présentation de l'organisme à l'usager : ses missions, ce qu'on peut y faire."
            value={draft.description}
            onChange={(description) => patch({ description })}
            maxLength={MAX_USER_INFO_DESCRIPTION_LENGTH}
          />
          <OpeningHoursEditor
            value={hours}
            onChange={(next) => {
              setHours(next);
              save.reset();
            }}
            errors={showErrors ? hoursErrors : {}}
          />
          <MarkdownField
            id="user-info-hours-notes"
            label="Remarques sur les horaires"
            hint="Ce que la grille ne dit pas : fermetures exceptionnelles, jours fériés, horaires d'été, permanences…"
            placeholder="Fermé les jours fériés. Horaires d'été du 14 juillet au 15 août : 9 h – 12 h."
            rows={3}
            value={draft.openingHoursNotes}
            onChange={(openingHoursNotes) => patch({ openingHoursNotes })}
            maxLength={MAX_USER_INFO_HOURS_NOTES_LENGTH}
          />
          <FaqEditor
            label="FAQ usagers"
            hint="Questions que se posent les usagers sur cet organisme. Distincte de la FAQ de chaque démarche."
            value={draft.faq}
            onChange={(faq) => patch({ faq })}
            max={MAX_USER_INFO_FAQ}
          />

          {showErrors && hasHoursErrors ? (
            <p className="text-sm text-destructive">
              Des horaires sont incomplets : corrigez les jours signalés avant d'enregistrer.
            </p>
          ) : null}
          {save.isError ? (
            <p className="text-sm text-destructive">{(save.error as Error).message}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
            {save.isSuccess && !save.isPending ? (
              <p className="text-sm text-success">Informations enregistrées et publiées.</p>
            ) : stored?.updatedAt ? (
              <p className="text-sm text-muted-foreground">
                Dernière mise à jour le {formatDate(stored.updatedAt)}.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
