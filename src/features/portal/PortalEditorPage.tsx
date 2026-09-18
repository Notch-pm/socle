import * as React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import { PageHeader } from "@/components/shared/PageHeader";
import { Field } from "@/components/ui/field";
import {
  useAllOrganizations,
  useOrganization,
  type Organization,
} from "@/features/superadmin/organizations/useOrganizationsAdmin";
import { useAdminRootOrganizations } from "@/features/ai-usage/useAdminRootOrganizations";
import { useProceduresForOrg } from "@/features/procedures/useProcedures";
import { useEnabledProcedureBindings } from "@/features/organizations/useOrganizationProcedures";
import { useOrganizationLanguages } from "@/features/languages/useOrganizationLanguages";
import { PortalEditor } from "@/features/portal/PortalEditor";
import { buildCatalogue, isoDay, portalTreeOrganizations } from "@/features/portal/catalogue";
import { parsePortalPage, type PortalPage } from "@/features/portal/portalPage";
import {
  useDiscardDraft,
  useEnsurePortalPage,
  usePortalPage,
  usePublishPortalPage,
  useSaveDraft,
  type PortalPageRow,
} from "@/features/portal/usePortalPage";
import { parsePortalTheme, type PortalTheme } from "@/features/portal/portalTheme";
import {
  useDiscardThemeDraft,
  useEnsurePortalTheme,
  usePortalTheme,
  usePublishPortalTheme,
  useSaveThemeDraft,
  type PortalThemeRow,
} from "@/features/portal/usePortalTheme";
import {
  ACCESSIBILITY_STATEMENT_SLUG,
  parsePortalContent,
  type PortalContent,
} from "@/features/portal/portalContent";
import {
  useDiscardContentDraft,
  useEnsurePortalContent,
  usePortalContent,
  usePublishPortalContent,
  useSaveContentDraft,
  type PortalContentRow,
} from "@/features/portal/usePortalContent";

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
 *  - admin       : /site-de-demarches (entrée du menu ; l'organisation est
 *                  choisie ici, comme sur /consommation-ia)
 *  - superadmin  : /superadmin/organisations/:orgId/portail
 */
export function PortalEditorPage({ variant }: { variant: "admin" | "superadmin" }) {
  const params = useParams<{ orgId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const isSuper = variant === "superadmin";

  // Côté collectivité, l'organisation ne vient pas de l'URL mais des racines
  // que l'utilisateur administre : une seule → directement ; plusieurs → il
  // choisit, et le choix vit dans l'URL (`?org=`) pour survivre au rechargement.
  const roots = useAdminRootOrganizations();
  const rootList = roots.data ?? [];
  const chosen = searchParams.get("org");
  const orgId = isSuper
    ? params.orgId
    : (chosen ?? (rootList.length === 1 ? rootList[0].id : undefined));

  const { data: organization, isLoading: loadingOrg } = useOrganization(orgId);
  const { data: row, isLoading: loadingRow } = usePortalPage(orgId);
  const ensure = useEnsurePortalPage();
  const { data: themeRow, isLoading: loadingTheme } = usePortalTheme(orgId);
  const ensureTheme = useEnsurePortalTheme();
  const { data: statementRow, isLoading: loadingStatement } = usePortalContent(
    orgId,
    ACCESSIBILITY_STATEMENT_SLUG,
  );
  const ensureStatement = useEnsurePortalContent();

  // Première ouverture : les lignes n'existent pas encore, on les crée avec
  // leurs valeurs par défaut. Les upserts sont idempotents — voir les hooks.
  const ensureMutate = ensure.mutate;
  React.useEffect(() => {
    if (orgId && !loadingRow && row === null && ensure.isIdle) ensureMutate(orgId);
  }, [orgId, loadingRow, row, ensure.isIdle, ensureMutate]);

  const ensureThemeMutate = ensureTheme.mutate;
  React.useEffect(() => {
    if (orgId && !loadingTheme && themeRow === null && ensureTheme.isIdle) ensureThemeMutate(orgId);
  }, [orgId, loadingTheme, themeRow, ensureTheme.isIdle, ensureThemeMutate]);

  const ensureStatementMutate = ensureStatement.mutate;
  React.useEffect(() => {
    if (orgId && !loadingStatement && statementRow === null && ensureStatement.isIdle) {
      ensureStatementMutate({ organizationId: orgId, slug: ACCESSIBILITY_STATEMENT_SLUG });
    }
  }, [orgId, loadingStatement, statementRow, ensureStatement.isIdle, ensureStatementMutate]);

  const closePath = isSuper ? `/superadmin/organisations/${orgId}` : "/";

  if (!isSuper && roots.isLoading) {
    return (
      <div className="p-6">
        <div className="h-32 animate-pulse rounded-lg bg-muted/40" />
      </div>
    );
  }

  if (!isSuper && !orgId) {
    if (rootList.length === 0) {
      return (
        <div className="p-6">
          <EmptyState message="Cette page est réservée aux administrateurs d'une organisation principale." />
        </div>
      );
    }
    return (
      <div className="p-6">
        <PageHeader
          title="Site de démarches"
          subtitle="Choisissez la collectivité dont vous composez la page d'accueil."
        />
        <Field label="Organisation" htmlFor="portal-editor-org" className="max-w-sm">
          <select
            id="portal-editor-org"
            value=""
            onChange={(e) => setSearchParams({ org: e.target.value })}
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="" disabled>
              Sélectionner une organisation
            </option>
            {rootList.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
    );
  }

  if (
    loadingOrg ||
    loadingRow ||
    loadingTheme ||
    loadingStatement ||
    (row === null && !ensure.isError) ||
    (themeRow === null && !ensureTheme.isError) ||
    (statementRow === null && !ensureStatement.isError)
  ) {
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

  if (!row || !themeRow || !statementRow) {
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
        themeRow={themeRow}
        statementRow={statementRow}
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
  themeRow,
  statementRow,
  organization,
  onClose,
}: {
  row: PortalPageRow;
  themeRow: PortalThemeRow;
  /** La déclaration d'accessibilité — le premier contenu du site. */
  statementRow: PortalContentRow;
  organization: Organization;
  onClose: () => void;
}) {
  const { data: procedures } = useProceduresForOrg(organization.id);
  // L'arbre que le portail sert — la racine et ses sous-organisations actives —
  // et qui y propose quoi : le canevas rend la liste réelle, avec les
  // organismes de chaque démarche, exactement comme le portail.
  const { data: allOrganizations } = useAllOrganizations();
  const tree = React.useMemo(
    () => portalTreeOrganizations(allOrganizations ?? [], organization.id),
    [allOrganizations, organization.id],
  );
  const { data: bindings } = useEnabledProcedureBindings(tree.map((org) => org.id));
  // Les langues de la collectivité. L'éditeur est toujours sur une racine (voir
  // la garde ci-dessus) : la colonne suffit, pas besoin de la RPC de résolution.
  const { data: enabledLanguages } = useOrganizationLanguages(organization.id);
  const saveDraft = useSaveDraft();
  const publish = usePublishPortalPage();
  const discard = useDiscardDraft();
  const saveTheme = useSaveThemeDraft();
  const publishTheme = usePublishPortalTheme();
  const discardTheme = useDiscardThemeDraft();
  const saveStatement = useSaveContentDraft();
  const publishStatement = usePublishPortalContent();
  const discardStatement = useDiscardContentDraft();

  const [page, setPage] = React.useState<PortalPage>(() => parsePortalPage(row.draft));
  const [theme, setTheme] = React.useState<PortalTheme>(() => parsePortalTheme(themeRow.draft));
  const [statement, setStatement] = React.useState<PortalContent>(() =>
    parsePortalContent(statementRow.draft),
  );
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [confirming, setConfirming] = React.useState<"publish" | "discard" | null>(null);

  // La dernière page connue et le drapeau « à écrire » vivent dans des refs :
  // le minuteur et le démontage doivent lire l'état du moment, pas celui de
  // leur fermeture.
  const latest = React.useRef(page);
  const dirty = React.useRef(false);
  const latestTheme = React.useRef(theme);
  const themeDirty = React.useRef(false);
  const latestStatement = React.useRef(statement);
  const statementDirty = React.useRef(false);
  const timer = React.useRef<number>();
  const saveMutate = saveDraft.mutate;
  const saveThemeMutate = saveTheme.mutate;
  const saveStatementMutate = saveStatement.mutate;

  // UN SEUL minuteur pour les trois tables : ce que l'agent voit, c'est « son
  // site », et des cadences distinctes ne produiraient que plusieurs moments où
  // perdre quelque chose. `flush` n'écrit que ce qui a changé — régler le thème
  // ne réécrit ni la composition ni la déclaration, et réciproquement.
  const flush = React.useCallback(() => {
    window.clearTimeout(timer.current);
    const done = { onSuccess: () => setSavedAt(new Date()) };
    if (dirty.current) {
      dirty.current = false;
      saveMutate({ id: row.id, draft: latest.current }, done);
    }
    if (themeDirty.current) {
      themeDirty.current = false;
      saveThemeMutate({ id: themeRow.id, draft: latestTheme.current }, done);
    }
    if (statementDirty.current) {
      statementDirty.current = false;
      saveStatementMutate({ id: statementRow.id, draft: latestStatement.current }, done);
    }
  }, [row.id, themeRow.id, statementRow.id, saveMutate, saveThemeMutate, saveStatementMutate]);

  function scheduleFlush() {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, AUTOSAVE_DELAY_MS);
  }

  function handleChange(next: PortalPage) {
    setPage(next);
    latest.current = next;
    dirty.current = true;
    scheduleFlush();
  }

  function handleThemeChange(next: PortalTheme) {
    setTheme(next);
    latestTheme.current = next;
    themeDirty.current = true;
    scheduleFlush();
  }

  function handleStatementChange(next: PortalContent) {
    setStatement(next);
    latestStatement.current = next;
    statementDirty.current = true;
    scheduleFlush();
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
    () => buildCatalogue(procedures ?? [], bindings ?? [], tree, today),
    [procedures, bindings, tree, today],
  );

  const contact = {
    name: organization.name,
    address: organization.address,
    phone: organization.phone,
    email: organization.email,
  };

  // Ce que dit la barre : l'écriture en cours prime, puis l'échec, puis la
  // dernière sauvegarde, puis l'état de publication de la ligne.
  // La date de publication est la plus RÉCENTE des trois : page, thème et
  // contenus partent ensemble désormais, mais une page publiée avant que le
  // thème n'existe garde la sienne, plus ancienne.
  const publishedAt = [row.published_at, themeRow.published_at, statementRow.published_at]
    .filter((value): value is string => value !== null)
    .sort()
    .pop();

  let statusLine: string;
  let statusIsError = false;
  if (saveDraft.isPending || saveTheme.isPending || saveStatement.isPending) {
    statusLine = "Enregistrement…";
  } else if (saveDraft.isError || saveTheme.isError || saveStatement.isError) {
    statusLine = "Échec de l'enregistrement — vos dernières modifications ne sont pas sauvegardées";
    statusIsError = true;
  } else if (savedAt) statusLine = `Brouillon enregistré à ${timeLabel(savedAt)}`;
  else if (publishedAt) statusLine = `Dernière publication le ${dateLabel(publishedAt)}`;
  else statusLine = "Page d'accueil jamais publiée";

  // ⚠️ PUBLIER, C'EST PUBLIER SON SITE : la composition, le thème ET les
  // contenus, d'un seul geste. Ce sont trois tables, donc trois écritures —
  // l'ordre est sans piège (un thème neuf sur une composition ancienne, ou
  // l'inverse, restent des pages valides ; une mention dont le lien attend la
  // déclaration n'affiche simplement pas de lien), et un échec partiel laisse
  // le bouton disponible avec son message à l'écran plutôt qu'une modale
  // refermée sur une publication partielle.
  async function confirmPublish() {
    // Publier écrit aussi le brouillon : ce qui part est exactement ce qui est
    // affiché, sauvegarde en attente comprise. On coupe donc le minuteur.
    window.clearTimeout(timer.current);
    dirty.current = false;
    themeDirty.current = false;
    statementDirty.current = false;
    try {
      await publish.mutateAsync({ id: row.id, draft: latest.current });
      await publishTheme.mutateAsync({ id: themeRow.id, draft: latestTheme.current });
      await publishStatement.mutateAsync({ id: statementRow.id, draft: latestStatement.current });
    } catch {
      // L'état d'erreur de la mutation est déjà posé : la modale reste ouverte
      // et l'affiche. On ne ferme surtout pas sur une publication à moitié
      // faite — c'est le seul endroit d'où l'agent peut la reprendre.
      return;
    }
    setSavedAt(new Date());
    setConfirming(null);
  }

  async function confirmDiscard() {
    window.clearTimeout(timer.current);
    dirty.current = false;
    themeDirty.current = false;
    statementDirty.current = false;
    try {
      const restored = await discard.mutateAsync({ id: row.id, published: row.published });
      setPage(restored);
      latest.current = restored;
      const restoredTheme = await discardTheme.mutateAsync({
        id: themeRow.id,
        published: themeRow.published,
      });
      setTheme(restoredTheme);
      latestTheme.current = restoredTheme;
      const restoredStatement = await discardStatement.mutateAsync({
        id: statementRow.id,
        published: statementRow.published,
      });
      setStatement(restoredStatement);
      latestStatement.current = restoredStatement;
    } catch {
      return;
    }
    setSavedAt(new Date());
    setConfirming(null);
  }

  const publishing = publish.isPending || publishTheme.isPending || publishStatement.isPending;
  const discarding = discard.isPending || discardTheme.isPending || discardStatement.isPending;
  const publishFailed = publish.isError || publishTheme.isError || publishStatement.isError;
  const discardFailed = discard.isError || discardTheme.isError || discardStatement.isError;
  const busy = publishing || discarding;

  return (
    <>
      <PortalEditor
        organizationName={organization.name}
        organizationLogoUrl={organization.logo_url}
        organizationLogoWhiteUrl={organization.logo_white_url}
        branding={{
          primaryColor: organization.primary_color,
          secondaryColor: organization.secondary_color,
        }}
        organizationId={organization.id}
        languages={enabledLanguages ?? []}
        page={page}
        onChange={handleChange}
        theme={theme}
        onThemeChange={handleThemeChange}
        statement={statement}
        onStatementChange={handleStatementChange}
        catalogue={catalogue}
        contact={contact}
        statusLine={statusLine}
        statusIsError={statusIsError}
        onPublish={() => {
          publish.reset();
          publishTheme.reset();
          publishStatement.reset();
          setConfirming("publish");
        }}
        onDiscard={() => {
          discard.reset();
          discardTheme.reset();
          discardStatement.reset();
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
            <AlertDialogTitle>Publier le site de démarches ?</AlertDialogTitle>
            <AlertDialogDescription>
              La composition de la page d'accueil, <strong>le thème du site et la déclaration
              d'accessibilité</strong> remplaceront ce que les usagers voient sur le portail. Vous
              pourrez continuer à modifier le brouillon ensuite sans rien changer en ligne.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {publishFailed ? (
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
              {publishing ? "Publication…" : "Publier"}
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
                ? "Le brouillon reviendra à la dernière version publiée — composition, thème et déclaration d'accessibilité. Ce qui est en ligne ne change pas."
                : "Rien n'a encore été publié : le brouillon reviendra à la composition et au thème par défaut, et la déclaration d'accessibilité sera vidée."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {discardFailed ? (
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
              {discarding ? "Annulation…" : "Annuler les modifications"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
