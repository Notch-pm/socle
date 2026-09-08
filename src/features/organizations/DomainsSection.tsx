import * as React from "react";
import { Globe, Plus, Star, Trash2, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/features/auth/AuthProvider";
import { usePlatformSettings } from "@/features/superadmin/platform/usePlatformSettings";
import {
  isProvidedDomain,
  normalizeHostname,
  portalUrl,
  validateHostname,
} from "@/features/organizations/organizationDomains";
import {
  UNIQUE_VIOLATION,
  useCreateOrganizationDomain,
  useDeleteOrganizationDomain,
  useOrganizationDomains,
  useSetPrimaryOrganizationDomain,
  type OrganizationDomain,
} from "@/features/organizations/useOrganizationDomains";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}

/**
 * Domaines par lesquels les usagers atteignent le portail de cette
 * collectivité.
 *
 * C'est la SEULE configuration tenant-specific du portail : celui-ci ne connaît
 * aucune collectivité, il demande au Socle à qui appartient le domaine visité.
 * Ajouter une ligne ici met une collectivité en ligne, sans redéploiement.
 *
 * Montée telle quelle par les deux écrans — l'éditeur d'organisation de
 * l'application par collectivité, et la page de réglages du superadmin.
 * Depuis le 2026-09-08, l'ÉCRITURE est réservée au super administrateur (RLS
 * `is_super_admin()`) : le sous-domaine fourni se pose à la création, et un
 * domaine personnalisé suppose un CNAME chez le client et un enregistrement
 * chez l'hébergeur du portail — un travail de l'éditeur. L'administrateur de
 * la collectivité lit ses domaines et la cible CNAME ; il n'en pose plus.
 * Le composant reflète le RLS, il ne le remplace pas.
 */
export function DomainsSection({ organizationId }: { organizationId: string }) {
  const { profile } = useAuth();
  const canEdit = profile?.global_role === "super_admin";
  const { data: platform } = usePlatformSettings();
  const suffix = platform?.portal_domain_suffix ?? null;
  const cnameTarget = platform?.portal_cname_target ?? null;

  const { data: domains, isLoading, isError } = useOrganizationDomains(organizationId);
  const createDomain = useCreateOrganizationDomain();
  const deleteDomain = useDeleteOrganizationDomain();
  const setPrimary = useSetPrimaryOrganizationDomain();

  const [input, setInput] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<OrganizationDomain | null>(null);

  const normalized = normalizeHostname(input);
  const validationError = input.trim() === "" ? null : validateHostname(input);
  // La forme stockée diffère de la saisie : on la montre, parce que c'est elle
  // qui portera l'unicité et que le portail la comparera telle quelle.
  const showPreview = normalized !== "" && normalized !== input.trim() && !validationError;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    setServerError(null);
    if (validateHostname(input) !== null) return;

    createDomain.mutate(
      {
        organization_id: organizationId,
        hostname: normalized,
        // Le premier domaine devient le domaine canonique : sans cela, une
        // collectivité qui n'en déclare qu'un n'en aurait aucun à écrire.
        is_primary: (domains?.length ?? 0) === 0,
      },
      {
        onSuccess: () => {
          setInput("");
          setTouched(false);
        },
        onError: (error) => {
          setServerError(
            isUniqueViolation(error)
              ? // L'unicité est GLOBALE : le domaine peut appartenir à une
                // collectivité que cet administrateur ne voit pas. On ne dit
                // donc pas laquelle — on dit quoi faire.
                "Ce domaine est déjà rattaché à une collectivité. Un domaine ne peut en désigner qu'une seule ; contactez un administrateur de la plateforme s'il devrait être le vôtre."
              : "L'enregistrement a échoué. Réessayez.",
          );
        },
      },
    );
  }

  const shownError = serverError ?? (touched ? validationError : null);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Domaines du portail usagers</CardTitle>
          <CardDescription>
            Les adresses par lesquelles vos usagers accèdent à vos démarches en ligne. Le portail
            n'a aucune configuration propre : c'est ce rattachement qui lui dit quelle collectivité
            servir.
            {suffix
              ? ` Le sous-domaine en .${suffix} est fourni par la plateforme et ne demande aucune configuration.`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canEdit ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <Field
                label="Nouveau domaine"
                htmlFor="domain-hostname"
                hint="Le domaine propre de la collectivité, par exemple demarches.ville-de-nantes.fr."
              >
                <div className="flex gap-2">
                  <Input
                    id="domain-hostname"
                    value={input}
                    onChange={(event) => {
                      setInput(event.target.value);
                      setServerError(null);
                    }}
                    onBlur={() => setTouched(true)}
                    placeholder="demarches.ville-de-nantes.fr"
                    aria-invalid={Boolean(shownError)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button type="submit" disabled={createDomain.isPending}>
                    <Plus />
                    {createDomain.isPending ? "Ajout…" : "Ajouter"}
                  </Button>
                </div>
                {shownError ? (
                  <p className="mt-1.5 text-sm text-destructive">{shownError}</p>
                ) : showPreview ? (
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Sera enregistré comme <span className="font-medium">{normalized}</span>
                  </p>
                ) : null}
              </Field>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Les domaines sont posés par l'éditeur de la plateforme. Pour un domaine propre à
              votre collectivité, contactez-le : il vous indiquera l'enregistrement DNS à créer.
            </p>
          )}

          {/* Le Socle enregistre le rattachement ; il ne configure aucun DNS.
              Le dire ici — avec la cible, quand la plateforme l'a réglée —
              évite le ticket « j'ai ajouté le domaine et ça ne répond pas ». */}
          <p className="mt-4 text-sm text-muted-foreground">
            {cnameTarget ? (
              <>
                Un domaine personnalisé doit pointer vers le portail dans votre configuration DNS :
                un enregistrement CNAME vers{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{cnameTarget}</code>. Le
                Socle enregistre le rattachement, il ne le publie pas.
              </>
            ) : (
              <>
                Le domaine doit également pointer vers le portail dans votre configuration DNS. Le
                Socle enregistre le rattachement, il ne le publie pas.
              </>
            )}
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="rounded-lg border border-border">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse border-b border-border bg-muted/40 last:border-b-0"
            />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">Impossible de charger les domaines.</p>
      ) : domains && domains.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-12 px-4 py-3" />
                <th className="px-4 py-3">Domaine</th>
                <th className="w-40 px-4 py-3" />
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {domains.map((domain) => (
                <tr key={domain.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Globe className="size-4" />
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={portalUrl(domain.hostname)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 font-medium hover:underline"
                    >
                      {domain.hostname}
                      <ExternalLink className="size-3.5 text-muted-foreground" />
                    </a>
                    {isProvidedDomain(domain.hostname, suffix) ? (
                      <Badge
                        variant="outline"
                        className="ml-2"
                        title="Attribué par la plateforme à la création : le DNS de la zone y répond déjà"
                      >
                        Sous-domaine fourni
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {domain.is_primary ? (
                      <Badge variant="secondary" title="Domaine écrit dans les liens envoyés aux usagers">
                        Principal
                      </Badge>
                    ) : canEdit ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={setPrimary.isPending}
                        onClick={() =>
                          setPrimary.mutate({ id: domain.id, organizationId })
                        }
                      >
                        <Star className="size-4" />
                        Définir principal
                      </Button>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {canEdit ? (
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Supprimer"
                          onClick={() => setDeleting(domain)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="Aucun domaine rattaché : le portail usagers de cette collectivité n'est accessible par aucune adresse." />
      )}

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer « {deleting?.hostname} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              {/* La conséquence est immédiate et visible par les usagers : elle
                  doit être écrite, pas devinée. */}
              Les usagers qui utilisent cette adresse n'atteindront plus vos démarches ; elle
              cessera de désigner votre collectivité dès la confirmation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleting) return;
                deleteDomain.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
              }}
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
