import * as React from "react";
import { Briefcase, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MarkdownField } from "@/features/procedures/steps/connaissances/MarkdownField";
import { MAX_ATTRIBUTIONS_LENGTH } from "@/features/organizations/attributions";
import { useAttributions, useSaveAttributions } from "@/features/organizations/useAttributions";
import type { Organization } from "@/features/superadmin/organizations/useOrganizationsAdmin";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Attributions d'un organisme — composant partagé par les deux zones (onglet
 * d'`OrganizationEditorPage` côté admin, section d'`OrgSettingsPage` côté
 * superadmin), comme `UserInfoSection`.
 *
 * ⚠️ Visible sur **toute** organisation, **service interne compris** : ce sont
 * souvent eux qui instruisent, et c'est précisément ce que l'IA de Clara doit
 * savoir. ⚠️ **Interne** : l'écran le dit, pour qu'on n'y écrive pas ce qui
 * relève des informations usagers.
 */
export function AttributionsSection({ organization }: { organization: Organization }) {
  const { data: stored, isLoading } = useAttributions(organization.id);
  const save = useSaveAttributions(organization.id);

  const [draft, setDraft] = React.useState<string | null>(null);

  // Une fois le texte enregistré connu, il amorce le formulaire.
  React.useEffect(() => {
    if (stored && draft === null) setDraft(stored.attributions);
  }, [stored, draft]);

  if (isLoading || draft === null) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(draft);
      }}
      className="flex flex-col gap-6"
    >
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Briefcase className="size-5 text-primary" />
            <div>
              <CardTitle className="text-base">Attributions</CardTitle>
              <CardDescription>
                Ce dont cet organisme s'occupe, pour orienter les demandes et les courriers vers le
                bon service. Texte interne : lu par les agents et leurs outils IA (Clara, par
                exemple), jamais affiché sur le site de démarches.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <MarkdownField
            id="organization-attributions"
            label="Attributions"
            hint="Ce que traite cet organisme : sujets, publics, exemples de demandes. Ce qu'il ne traite pas."
            placeholder={
              "Traite : voirie, éclairage public, propreté, espaces verts.\nNe traite pas : stationnement (police municipale)."
            }
            value={draft}
            onChange={(next) => {
              setDraft(next);
              save.reset();
            }}
            maxLength={MAX_ATTRIBUTIONS_LENGTH}
          />
          <p
            className={cn(
              "self-end text-xs",
              draft.length >= MAX_ATTRIBUTIONS_LENGTH ? "text-destructive" : "text-muted-foreground",
            )}
            aria-live="polite"
          >
            {draft.length} / {MAX_ATTRIBUTIONS_LENGTH} caractères
          </p>

          {save.isError ? (
            <p className="text-sm text-destructive">{(save.error as Error).message}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
            {save.isSuccess && !save.isPending ? (
              <p className="text-sm text-success">Attributions enregistrées.</p>
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
