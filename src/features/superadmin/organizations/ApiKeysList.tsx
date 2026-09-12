import * as React from "react";
import { Plus, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  useApiKeys,
  useRevokeApiKey,
  type ApiKeyApplicationFilter,
  type ApiKeyListItem,
  type ApiKeyOwner,
} from "@/features/superadmin/organizations/useApiKeys";
import { apiKeyStatus, type ApiKeyStatus } from "@/features/superadmin/organizations/apiKeys";
import { ApiKeyFormDialog } from "@/features/superadmin/organizations/ApiKeyFormDialog";
import {
  useApplications,
  useAssignApiKeyApplication,
} from "@/features/superadmin/applications/useApplications";
import { useAuth } from "@/features/auth/AuthProvider";

/** Libellés des scopes de clé (colonne `api_keys.scopes`) — les CINQ. */
export const SCOPE_LABEL: Record<string, string> = {
  read: "Référentiel (lecture)",
  contacts: "Usagers",
  smtp: "Relais SMTP (mot de passe)",
  ai: "Assistant IA (facturé)",
  audience: "Audience du portail (écriture)",
};

const STATUS_LABEL: Record<ApiKeyStatus, string> = {
  active: "Active",
  revoked: "Révoquée",
  expired: "Expirée",
};

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-FR") : "—";
}

/**
 * Liste des clés d'un propriétaire (organisation racine, ou plateforme si
 * `owner = null`) + création (`ApiKeyFormDialog`) + révocation (`AlertDialog`).
 * Partagée entre la section « API publique » d'une organisation et la page
 * « Applications », qui la monte une fois par application (`application`).
 *
 * Une clé plateforme d'avant le registre (sans application) est refusée par
 * les trois fonctions : la liste le dit, et propose de la rattacher.
 */
export function ApiKeysList({
  owner,
  application,
}: {
  owner: ApiKeyOwner;
  application?: ApiKeyApplicationFilter;
}) {
  const isPlatform = owner === null;
  const { profile } = useAuth();
  const { data: keys, isLoading } = useApiKeys(owner, application);
  const { data: applications } = useApplications();
  const revoke = useRevokeApiKey();
  const assign = useAssignApiKeyApplication();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [toRevoke, setToRevoke] = React.useState<ApiKeyListItem | null>(null);

  const applicationName = (id: string | null) =>
    id ? (applications ?? []).find((app) => app.id === id)?.name ?? id : null;
  const canCreate = application !== null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {application === null
            ? "Clés plateforme sans application"
            : isPlatform
              ? "Clés existantes"
              : "Clés existantes"}
        </h2>
        {canCreate ? (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            {isPlatform ? "Nouvelle clé plateforme" : "Nouvelle clé"}
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : !keys || keys.length === 0 ? (
        <EmptyState
          message={
            application === null
              ? "Aucune clé à rattacher."
              : isPlatform
                ? "Aucune clé pour cette application."
                : "Aucune clé API pour cette organisation."
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {keys.map((key) => {
            const status = apiKeyStatus(key);
            const orphan = isPlatform && key.consumer === null && status === "active";
            return (
              <Card key={key.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{key.name}</span>
                      <Badge
                        variant={status === "active" ? "secondary" : "muted"}
                        className={status === "active" ? "bg-primary/10 text-primary" : undefined}
                      >
                        {STATUS_LABEL[status]}
                      </Badge>
                      {key.scopes.map((scope) => (
                        <Badge key={scope} variant="muted">
                          {SCOPE_LABEL[scope] ?? scope}
                        </Badge>
                      ))}
                      {key.consumer ? (
                        <Badge variant="outline" title="Application rattachée">
                          {applicationName(key.consumer)}
                        </Badge>
                      ) : null}
                      {isPlatform ? (
                        orphan ? (
                          <Badge variant="outline" className="border-destructive/40 text-destructive">
                            Sans application — refusée par les API
                          </Badge>
                        ) : (
                          <Badge variant="outline">Collectivités abonnées</Badge>
                        )
                      ) : null}
                    </div>
                    <code className="text-xs text-muted-foreground">{key.key_prefix}…</code>
                    <p className="text-xs text-muted-foreground">
                      Créée le {formatDate(key.created_at)} · Dernière utilisation :{" "}
                      {formatDate(key.last_used_at)}
                      {key.expires_at ? ` · Expire le ${formatDate(key.expires_at)}` : ""}
                    </p>
                    {orphan ? (
                      <label className="mt-1 flex items-center gap-2 text-xs">
                        <span>Rattacher à</span>
                        <select
                          aria-label={`Rattacher « ${key.name} » à une application`}
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          defaultValue=""
                          disabled={assign.isPending}
                          onChange={(e) => {
                            if (e.target.value) {
                              assign.mutate({ keyId: key.id, applicationId: e.target.value });
                            }
                          }}
                        >
                          <option value="">Choisir une application…</option>
                          {(applications ?? []).map((app) => (
                            <option key={app.id} value={app.id}>
                              {app.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                  {status !== "revoked" ? (
                    <Button variant="outline" size="sm" onClick={() => setToRevoke(key)}>
                      Révoquer
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {canCreate ? (
        <ApiKeyFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          owner={owner}
          createdBy={profile?.id}
          application={application ?? undefined}
        />
      ) : null}

      <AlertDialog open={toRevoke !== null} onOpenChange={(o) => !o && setToRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Révoquer cette clé ?</AlertDialogTitle>
            <AlertDialogDescription>
              {isPlatform
                ? `La clé « ${toRevoke?.name ?? ""} » cessera immédiatement de fonctionner pour toutes les collectivités abonnées à son application. Cette action est irréversible.`
                : `La clé « ${toRevoke?.name ?? ""} » cessera immédiatement de fonctionner. Cette action est irréversible.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toRevoke) revoke.mutate(toRevoke.id, { onSettled: () => setToRevoke(null) });
              }}
            >
              Révoquer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
