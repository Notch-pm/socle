import { AppWindow } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  useApplications,
  useOrganizationApplications,
  useSetOrganizationApplication,
} from "@/features/superadmin/applications/useApplications";

/**
 * Les applications de la gamme souscrites par cette collectivité.
 *
 * Cocher une application, c'est tout l'onboarding côté clés : la clé de
 * l'application (une par application, posée une fois dans son projet) voit
 * désormais cette collectivité. Aucun secret n'est généré, rien ne circule.
 * Décocher retire la collectivité du périmètre de la clé — le portail ne
 * répond plus sur ses domaines, Iris et Clara ne la voient plus à leur
 * prochaine synchronisation.
 *
 * Seules les applications de scope `abonnement` se souscrivent : le Socle
 * lui-même (scope `plateforme`) sert toutes les collectivités.
 */
export function ApplicationsSection({ organizationId }: { organizationId: string }) {
  const { profile } = useAuth();
  const { data: applications, isLoading } = useApplications();
  const { data: subscriptions } = useOrganizationApplications(organizationId);
  const setApplication = useSetOrganizationApplication();

  const subscribed = new Set((subscriptions ?? []).map((s) => s.application_id));
  const offered = (applications ?? []).filter((app) => app.scope === "abonnement");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <AppWindow className="size-5 text-primary" />
          <div>
            <CardTitle className="text-base">Applications souscrites</CardTitle>
            <CardDescription>
              Chaque application de la gamme tient une clé unique ; cocher une application donne à
              cette clé le droit de voir cette collectivité. Le portail usagers ne répond sur ses
              domaines qu'une fois Nora cochée.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
        ) : offered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune application au registre.</p>
        ) : (
          offered.map((app) => (
            <label
              key={app.id}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3"
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{app.name}</span>
                <span className="text-xs text-muted-foreground">
                  <code className="rounded bg-muted px-1 py-0.5">{app.id}</code>
                </span>
              </span>
              <Switch
                checked={subscribed.has(app.id)}
                disabled={setApplication.isPending}
                aria-label={app.name}
                onCheckedChange={(enabled) =>
                  setApplication.mutate({
                    organizationId,
                    applicationId: app.id,
                    enabled,
                    createdBy: profile?.id,
                  })
                }
              />
            </label>
          ))
        )}
        {setApplication.error ? (
          <p className="text-sm text-destructive">{(setApplication.error as Error).message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
