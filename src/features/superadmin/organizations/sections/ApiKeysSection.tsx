import * as React from "react";
import { KeyRound, Plus, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
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
import { useApiKeys, useRevokeApiKey, type ApiKeyListItem } from "@/features/superadmin/organizations/useApiKeys";
import { ApiKeyFormDialog } from "@/features/superadmin/organizations/ApiKeyFormDialog";
import { useAuth } from "@/features/auth/AuthProvider";

const API_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-api`;

type KeyStatus = "active" | "revoked" | "expired";

function keyStatus(key: ApiKeyListItem): KeyStatus {
  if (key.revoked_at) return "revoked";
  if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) return "expired";
  return "active";
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-FR") : "—";
}

const STATUS_LABEL: Record<KeyStatus, string> = {
  active: "Active",
  revoked: "Révoquée",
  expired: "Expirée",
};

export function ApiKeysSection({ organizationId }: { organizationId: string }) {
  const { profile } = useAuth();
  const { data: keys, isLoading } = useApiKeys(organizationId);
  const revoke = useRevokeApiKey();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [toRevoke, setToRevoke] = React.useState<ApiKeyListItem | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <KeyRound className="size-5 text-primary" />
            <div>
              <CardTitle className="text-base">API publique (lecture seule)</CardTitle>
              <CardDescription>
                Délivrez des clés pour que d'autres applications (Clara, Ariane, partenaires)
                consultent les organisations, démarches et catégories de cette organisation et de
                sa descendance. Les clés sont destinées à un usage serveur-à-serveur.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Base de l'API :</span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{API_BASE_URL}</code>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="/api-doc"
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1.5 text-primary hover:underline"
            >
              Documentation (Swagger) <ExternalLink className="size-3.5" />
            </a>
            <a
              href={`${API_BASE_URL}/openapi.json`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1.5 text-primary hover:underline"
            >
              Contrat OpenAPI (JSON) <ExternalLink className="size-3.5" />
            </a>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Clés existantes</h2>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          Nouvelle clé
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : !keys || keys.length === 0 ? (
        <EmptyState message="Aucune clé API pour cette organisation." />
      ) : (
        <div className="flex flex-col gap-3">
          {keys.map((key) => {
            const status = keyStatus(key);
            return (
              <Card key={key.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{key.name}</span>
                      <Badge
                        variant={status === "active" ? "secondary" : "muted"}
                        className={status === "active" ? "bg-primary/10 text-primary" : undefined}
                      >
                        {STATUS_LABEL[status]}
                      </Badge>
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
        organizationId={organizationId}
        createdBy={profile?.id}
      />

      <AlertDialog open={toRevoke !== null} onOpenChange={(o) => !o && setToRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Révoquer cette clé ?</AlertDialogTitle>
            <AlertDialogDescription>
              La clé « {toRevoke?.name} » cessera immédiatement de fonctionner. Cette action est
              irréversible.
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
