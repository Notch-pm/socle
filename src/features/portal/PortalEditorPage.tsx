import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { EmptyState } from "@/components/shared/EmptyState";
import { useOrganization, type Organization } from "@/features/superadmin/organizations/useOrganizationsAdmin";
import { useProceduresForOrg } from "@/features/procedures/useProcedures";
import { PortalEditor } from "@/features/portal/PortalEditor";
import { isoDay, toCatalogueEntry } from "@/features/portal/catalogue";
import { parsePortalPage, type PortalPage } from "@/features/portal/portalPage";
import {
  useDiscardDraft,
  useEnsurePortalPage,
  usePortalPage,
  usePublishPortalPage,
  useSaveDraft,
  type PortalPageRow,
} from "@/features/portal/usePortalPage";

/**
 * Délai entre la dernière modification et l'écriture du brouillon. Assez
 * court pour qu'on ne perde rien en fermant l'onglet, assez long pour qu'une
 * phrase tapée ne parte pas lettre par lettre.
 */
export const AUTOSAVE_DELAY_MS = 800;

function timeLabel(date: Date): string {
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Éditeur de la page d'accueil du portail, en pleine page. Sert les deux zones,
 * comme `ProcedureEditorPage` : un super admin ne voit jamais les routes de
 * l'application par organisation.
 *  - admin       : /organisations/:orgId/portail
 *  - superadmin  : /superadmin/organisations/:orgId/portail
 */
export function PortalEditorPage({ variant }: { variant: "admin" | "superadmin" }) {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { data: organization, isLoading: loadingOrg } = useOrganization(orgId);
  const { data: row, isLoading: loadingRow } = usePortalPage(orgId);
  const ensure = useEnsurePortalPage();

  // Première ouverture : la ligne n'existe pas encore, on la crée avec la
  // composition par défaut. L'upsert est idempotent — voir useEnsurePortalPage.
  const ensureMutate = ensure.mutate;
  React.useEffect(() => {
    if (orgId && !loadingRow && row === null && ensure.isIdle) ensureMutate(orgId);
  }, [orgId, loadingRow, row, ensure.isIdle, ensureMutate]);

  const closePath =
    variant === "superadmin" ? `/superadmin/organisations/${orgId}` : `/organisations/${orgId}`;

  if (loadingOrg || loadingRow || (row === null && !ensure.isError)) {
    return (
      <div className="p-6">
        <div className="h-32 animate-pulse rounded-lg bg-muted/40" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="p-6">
        <EmptyState message="Organisation introuvable." />
      </div>
    );
  }

  if (organization.parent_id !== null) {
    return (
      <div className="p-6">
        <EmptyState message="La page d'accueil du portail se compose au niveau de l'organisation principale (racine)." />
      </div>
    );
  }

  if (!row) {
    return (
      <div className="p-6">
        <EmptyState message="La page n'a pas pu être créée. Vérifiez vos droits sur cette organisation." />
      </div>
    );
  }

  // `key` : si la ligne change d'identité, on repart d'un état local neuf.
  return (
    <div className="h-full">
      <LoadedEditor
        key={row.id}
        row={row}
        organization={organization}
        onClose={() => navigate(closePath)}
      />
    </div>
  );
}

/**
 * L'éditeur une fois la ligne chargée. Possède l'état local de la page : la
 * requête ne le pilote plus après le montage, sans quoi chaque relecture
 * pendant la frappe ramènerait une version d'avant la frappe.
 */
function LoadedEditor({
  row,
  organization,
  onClose,
}: {
  row: PortalPageRow;
  organization: Organization;
  onClose: () => void;
}) {
  const { data: procedures } = useProceduresForOrg(organization.id);
  const saveDraft = useSaveDraft();
  const publish = usePublishPortalPage();
  const discard = useDiscardDraft();

  const [page, setPage] = React.useState<PortalPage>(() => parsePortalPage(row.draft));
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [confirming, setConfirming] = React.useState<"publish" | "discard" | null>(null);

  // La dernière page connue et le drapeau « à écrire » vivent dans des refs :
  // le minuteur et le démontage doivent lire l'état du moment, pas celui de
  // leur fermeture.
  const latest = React.useRef(page);
  const dirty = React.useRef(false);
  const timer = React.useRef<number>();
  const saveMutate = saveDraft.mutate;

  const flush = React.useCallback(() => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    saveMutate(
      { id: row.id, draft: latest.current },
      { onSuccess: () => setSavedAt(new Date()) },
    );
  }, [row.id, saveMutate]);

  function handleChange(next: PortalPage) {
    setPage(next);
    latest.current = next;
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, AUTOSAVE_DELAY_MS);
  }

  // Quitter l'éditeur — ou l'onglet — pendant le délai ne doit rien perdre.
  React.useEffect(() => {
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [flush]);

  const today = isoDay();
  const catalogue = React.useMemo(
    () => (procedures ?? []).map((p) => toCatalogueEntry(p, today)),
    [procedures, today],
  );

  const contact = {
    name: organization.name,
    address: organization.address,
    phone: organization.phone,
    email: organization.email,
  };

  // Ce que dit la barre : l'écriture en cours prime, puis l'échec, puis la
  // dernière sauvegarde, puis l'état de publication de la ligne.
  let statusLine: string;
  let statusIsError = false;
  if (saveDraft.isPending) statusLine = "Page d'accueil · enregistrement…";
  else if (saveDraft.isError) {
    statusLine = "Page d'accueil · échec de l'enregistrement — vos dernières modifications ne sont pas sauvegardées";
    statusIsError = true;
  } else if (savedAt) statusLine = `Page d'accueil · brouillon enregistré à ${timeLabel(savedAt)}`;
  else if (row.published_at) statusLine = `Page d'accueil · dernière publication le ${dateLabel(row.published_at)}`;
  else statusLine = "Page d'accueil · jamais publiée";

  function confirmPublish() {
    // Publier écrit aussi le brouillon : ce qui part est exactement ce qui est
    // affiché, sauvegarde en attente comprise. On coupe donc le minuteur.
    window.clearTimeout(timer.current);
    dirty.current = false;
    publish.mutate(
      { id: row.id, draft: latest.current },
      {
        onSuccess: () => {
          setSavedAt(new Date());
          setConfirming(null);
        },
      },
    );
  }

  function confirmDiscard() {
    window.clearTimeout(timer.current);
    dirty.current = false;
    discard.mutate(
      { id: row.id, published: row.published },
      {
        onSuccess: (restored) => {
          setPage(restored);
          latest.current = restored;
          setSavedAt(new Date());
          setConfirming(null);
        },
      },
    );
  }

  const busy = publish.isPending || discard.isPending;

  return (
    <>
      <PortalEditor
        organizationName={organization.name}
        page={page}
        onChange={handleChange}
        catalogue={catalogue}
        contact={contact}
        statusLine={statusLine}
        statusIsError={statusIsError}
        onPublish={() => {
          publish.reset();
          setConfirming("publish");
        }}
        onDiscard={() => {
          discard.reset();
          setConfirming("discard");
        }}
        onClose={onClose}
        busy={busy}
      />

      {/* Les deux confirmations se ferment sur succès, pas au clic : un refus
          du RLS doit rester visible, pas disparaître avec la modale. */}
      <AlertDialog open={confirming === "publish"} onOpenChange={(open) => !open && !busy && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publier la page d'accueil ?</AlertDialogTitle>
            <AlertDialogDescription>
              La composition actuelle remplacera celle que les usagers voient sur le portail.
              Vous pourrez continuer à modifier le brouillon ensuite sans rien changer en ligne.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {publish.isError ? (
            <p className="text-sm text-destructive">
              La publication a échoué. Vérifiez vos droits sur cette organisation, puis réessayez.
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                confirmPublish();
              }}
            >
              {publish.isPending ? "Publication…" : "Publier"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirming === "discard"} onOpenChange={(open) => !open && !busy && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler les modifications ?</AlertDialogTitle>
            <AlertDialogDescription>
              {row.published
                ? "Le brouillon reviendra à la dernière composition publiée. Ce qui est en ligne ne change pas."
                : "Rien n'a encore été publié : le brouillon reviendra à la composition par défaut."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {discard.isError ? (
            <p className="text-sm text-destructive">L'annulation a échoué. Réessayez.</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Conserver mes modifications</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                confirmDiscard();
              }}
            >
              {discard.isPending ? "Annulation…" : "Annuler les modifications"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
