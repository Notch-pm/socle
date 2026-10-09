import * as React from "react";
import { Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  FREE_MAIL_DEFAULT_TITLE,
  FREE_MAIL_TITLE_MAX_LENGTH,
  cleanFreeMailTitle,
  freeMailTitleIssue,
  freeMailUnavailableReason,
} from "@/features/organizations/freeMail";
import {
  FREE_MAIL_CLOSED,
  useFreeMailSettings,
  useRootApplications,
  useSaveFreeMail,
} from "@/features/organizations/useFreeMail";
import type { Organization } from "@/features/superadmin/organizations/useOrganizationsAdmin";

const SWITCH_LABEL = "Permettre aux usagers d'envoyer un courrier libre à cet organisme depuis le site";

/**
 * Courrier libre (site Nora) — l'usager écrit à cet organisme un courrier qui
 * ne relève d'aucune démarche ; Clara le reçoit. Composant partagé par les
 * deux zones (onglet « Informations usagers » d'`OrganizationEditorPage`,
 * section du même nom d'`OrgSettingsPage`), sous les informations usagers :
 * c'est, comme elles, ce que l'organisme offre au public.
 *
 * Sur TOUTE organisation affichée au portail, sans héritage. Disponible
 * seulement si la racine est abonnée à Nora ET à Clara : sinon l'écran dit
 * pourquoi, sans bascule. (L'API publique, elle, ne vérifie que Clara : la clé
 * de Nora ne voit déjà que les collectivités abonnées à Nora.)
 *
 * ⚠️ L'interrupteur agit tout de suite (pas de « Publier ») et CONSERVE le
 * titre quand on le coupe — le réglage gouverne l'usage, pas la donnée.
 */
export function FreeMailSection({ organization }: { organization: Organization }) {
  const { profile } = useAuth();
  const { data: stored, isLoading } = useFreeMailSettings(organization.id);
  const { data: applications, isLoading: appsLoading } = useRootApplications(organization.id);
  const save = useSaveFreeMail(organization.id);

  const settings = stored ?? FREE_MAIL_CLOSED;
  const [draftTitle, setDraftTitle] = React.useState<string | null>(null);

  // Une fois le titre enregistré connu, il amorce le champ.
  React.useEffect(() => {
    if (stored && draftTitle === null) setDraftTitle(stored.title ?? "");
  }, [stored, draftTitle]);

  const title = draftTitle ?? "";
  const titleIssue = freeMailTitleIssue(title);
  const unavailable = applications ? freeMailUnavailableReason(applications) : null;
  const titleDirty = cleanFreeMailTitle(title) !== settings.title;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Send className="size-5 text-primary" />
          <div>
            <CardTitle className="text-base">Courrier libre (site Nora)</CardTitle>
            <CardDescription>
              Un formulaire du site de démarches pour écrire à cet organisme quand aucune démarche
              ne correspond. Le courrier arrive dans la gestion du courrier (Clara), où il est
              enregistré et traité comme un courrier reçu.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading || appsLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
        ) : unavailable ? (
          <p role="note" className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
            {unavailable}
          </p>
        ) : (
          <>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{SWITCH_LABEL}</span>
                <span className="text-xs text-muted-foreground">
                  Effet immédiat, sans publication du site. Le lien apparaît sur la page de
                  l'organisme.
                </span>
              </span>
              <Switch
                checked={settings.enabled}
                disabled={save.isPending}
                aria-label={SWITCH_LABEL}
                onCheckedChange={(enabled) =>
                  // Le titre ENREGISTRÉ part avec l'interrupteur, pas le brouillon
                  // du champ : basculer n'enregistre pas une saisie en cours.
                  save.mutate({ enabled, title: settings.title, updatedBy: profile?.id })
                }
              />
            </label>

            <form
              noValidate
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (titleIssue) return;
                save.mutate({ enabled: settings.enabled, title, updatedBy: profile?.id });
              }}
            >
              <Field
                label="Titre"
                htmlFor="free-mail-title"
                hint={`Libellé du lien et de la page. Vide : « ${FREE_MAIL_DEFAULT_TITLE} », traduit dans les langues du site.`}
                error={titleIssue ?? undefined}
              >
                <Input
                  id="free-mail-title"
                  value={title}
                  placeholder={FREE_MAIL_DEFAULT_TITLE}
                  maxLength={FREE_MAIL_TITLE_MAX_LENGTH}
                  onChange={(e) => {
                    setDraftTitle(e.target.value);
                    save.reset();
                  }}
                />
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={save.isPending || !titleDirty || Boolean(titleIssue)}>
                  {save.isPending ? "Enregistrement…" : "Enregistrer le titre"}
                </Button>
                {!settings.enabled ? (
                  <p className="text-xs text-muted-foreground">
                    Sans effet tant que le courrier libre n'est pas proposé — le titre est conservé.
                  </p>
                ) : null}
              </div>
            </form>
          </>
        )}
        {save.isError ? <p className="text-sm text-destructive">{(save.error as Error).message}</p> : null}
      </CardContent>
    </Card>
  );
}
