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
  type ApiKeyListItem,
  type ApiKeyOwner,
} from "@/features/superadmin/organizations/useApiKeys";
import { apiKeyStatus, type ApiKeyStatus } from "@/features/superadmin/organizations/apiKeys";
import { ApiKeyFormDialog } from "@/features/superadmin/organizations/ApiKeyFormDialog";
import { useAuth } from "@/features/auth/AuthProvider";

/** Libellés des scopes de clé (colonne `api_keys.scopes`). */
const SCOPE_LABEL: Record<string, string> = {
  read: "Référentiel (lecture)",
  contacts: "Usagers",
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
 * « Clés plateforme ».
 */
export function ApiKeysList({ owner }: { owner: ApiKeyOwner }) {
  const isPlatform = owner === null;
  const { profile } = useAuth();
  const { data: keys, isLoading } = useApiKeys(owner);
  const revoke = useRevokeApiKey();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [toRevoke, setToRevoke] = React.useState<ApiKeyListItem | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {isPlatform ? "Clés plateforme existantes" : "Clés existantes"}
        </h2>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          {isPlatform ? "Nouvelle clé plateforme" : "Nouvelle clé"}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : !keys || keys.length === 0 ? (
        <EmptyState
          message={isPlatform ? "Aucune clé plateforme." : "Aucune clé API pour cette organisation."}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {keys.map((key) => {
            const status = apiKeyStatus(key);
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
                      {isPlatform ? (
                        <Badge variant="outline" className="border-destructive/40 text-destructive">
                          Toutes les organisations
                        </Badge>
                      ) : null}
                    </div>
                    <code className="text-xs text-muted-foreground">{key.key_prefix}…</code>
                    <p className="text-xs text-muted-foreground">
                      Créée le {formatDate(key.created_at)} · Dernière utilisation :{" "}
                      {formatDate(key.last_used_at)}
                      {key.expires_at ? ` · Expire le ${formatDate(key.expires_at)}` : ""}
                    </p>
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

      <ApiKeyFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        owner={owner}
        createdBy={profile?.id}
      />

      <AlertDialog open={toRevoke !== null} onOpenChange={(o) => !o && setToRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Révoquer cette clé ?</AlertDialogTitle>
            <AlertDialogDescription>
              {isPlatform
                ? `La clé plateforme « ${toRevoke?.name ?? ""} » cessera immédiatement de fonctionner pour toutes les organisations. Cette action est irréversible.`
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
