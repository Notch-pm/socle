import * as React from "react";
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

/**
 * Prévient avant de fermer ou de recharger l'onglet tant qu'une saisie n'est
 * pas enregistrée. Le navigateur affiche son propre message : on ne choisit
 * que le moment.
 *
 * ⚠️ Ne couvre **pas** la navigation dans l'application (rail, liens) : le
 * routeur est un `BrowserRouter`, sans `useBlocker`. Les changements de
 * contexte **dans une page** (autre organisme, autre section) passent, eux,
 * par `DiscardChangesDialog`.
 */
export function useWarnBeforeUnload(dirty: boolean) {
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Exigé par les navigateurs plus anciens pour déclencher la question.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

/**
 * Confirmation avant de quitter une saisie non enregistrée. « Continuer la
 * saisie » est le choix par défaut (bouton qui reçoit le focus) : perdre un
 * texte doit demander un geste délibéré.
 */
export function DiscardChangesDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Abandonner les modifications ?</AlertDialogTitle>
          <AlertDialogDescription>
            Ce que vous avez saisi n'est pas enregistré et sera perdu.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel autoFocus>Continuer la saisie</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Abandonner</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Garde d'un changement de contexte dans une page : `request(next)` l'applique
 * tout de suite si rien n'est en cours, sinon ouvre la confirmation.
 */
export function useDiscardGuard<T>(dirty: boolean, apply: (next: T) => void) {
  const [pending, setPending] = React.useState<{ next: T } | null>(null);
  useWarnBeforeUnload(dirty);
  return {
    request: (next: T) => (dirty ? setPending({ next }) : apply(next)),
    dialog: (
      <DiscardChangesDialog
        open={pending !== null}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) apply(pending.next);
          setPending(null);
        }}
      />
    ),
  };
}

/**
 * Remonte l'état « saisie non enregistrée » d'un formulaire à la page qui
 * l'héberge — et le remet à faux quand le formulaire disparaît.
 */
export function useReportDirty(dirty: boolean, onDirtyChange?: (dirty: boolean) => void) {
  const callback = React.useRef(onDirtyChange);
  callback.current = onDirtyChange;
  React.useEffect(() => {
    callback.current?.(dirty);
  }, [dirty]);
  React.useEffect(() => () => callback.current?.(false), []);
}
