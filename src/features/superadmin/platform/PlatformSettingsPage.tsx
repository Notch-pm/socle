import * as React from "react";
import { Loader2, RefreshCw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  provisionReportLabel,
  settingsInput,
  validateSettings,
  type PlatformSettingsErrors,
  type PlatformSettingsInput,
  type ProvisionReport,
} from "./platformSettings";
import {
  useProvisionExistingRoots,
  usePlatformSettings,
  useSavePlatformSettings,
} from "./usePlatformSettings";

/**
 * Réglages de plateforme : ce qui vaut pour tous les clients à la fois, posé
 * une fois par l'éditeur. Chaque valeur gouverne ce que le Socle pose de
 * lui-même à la création d'une collectivité (`provision_root`) ; le bouton du
 * bas rejoue ce provisioning sur les collectivités déjà là.
 *
 * Les secrets de la plateforme (clé du fournisseur IA, relais de messagerie de
 * repli, hook d'authentification) ne sont PAS ici : ils vivent dans le projet
 * Supabase, et sont décrits dans docs/onboarding.md.
 */
export function PlatformSettingsPage() {
  const settings = usePlatformSettings();
  const save = useSavePlatformSettings();
  const provision = useProvisionExistingRoots();

  const [input, setInput] = React.useState<PlatformSettingsInput>(() => settingsInput(null));
  const [errors, setErrors] = React.useState<PlatformSettingsErrors>({});
  const [report, setReport] = React.useState<ProvisionReport | null>(null);
  const [dirty, setDirty] = React.useState(false);

  // La ligne arrive après le premier rendu : on la reflète tant que
  // l'opérateur n'a rien touché — ensuite, sa saisie a le dernier mot.
  React.useEffect(() => {
    if (!dirty && settings.data) setInput(settingsInput(settings.data));
  }, [settings.data, dirty]);

  function update<K extends keyof PlatformSettingsInput>(key: K, value: string) {
    setDirty(true);
    setInput((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const { errors: found, write } = validateSettings(input);
    setErrors(found);
    if (!write) return;
    save.mutate(write, { onSuccess: () => setDirty(false) });
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Plateforme</h1>
        <p className="text-muted-foreground">
          Ce qui vaut pour toutes les collectivités, et ce que le Socle pose de lui-même à chaque
          nouvelle organisation principale.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="size-5 text-primary" />
            <div>
              <CardTitle className="text-base">Réglages</CardTitle>
              <CardDescription>
                Une case vide laisse le réglage sans effet : aucun sous-domaine attribué, aucun
                plafond posé.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {settings.isLoading ? (
            <div className="h-32 animate-pulse rounded-lg bg-muted/40" />
          ) : settings.isError ? (
            <p className="text-sm text-destructive">Impossible de lire les réglages.</p>
          ) : (
            <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-4">
              <Field
                label="Zone des sous-domaines fournis"
                htmlFor="ps-suffix"
                hint="Chaque nouvelle collectivité reçoit <slug>.<zone> comme domaine de portail. Le DNS de la zone doit pointer en wildcard vers le portail."
              >
                <Input
                  id="ps-suffix"
                  value={input.portalDomainSuffix}
                  onChange={(e) => update("portalDomainSuffix", e.target.value)}
                  placeholder="demarches.edilumen.fr"
                  aria-invalid={Boolean(errors.portalDomainSuffix)}
                  autoComplete="off"
                  spellCheck={false}
                />
                {errors.portalDomainSuffix ? (
                  <p className="mt-1.5 text-sm text-destructive">{errors.portalDomainSuffix}</p>
                ) : null}
              </Field>

              <Field
                label="Cible CNAME des domaines personnalisés"
                htmlFor="ps-cname"
                hint="Nom d'hôte vers lequel un domaine propre à une collectivité (demarches.ville.fr) doit pointer. Affiché dans l'écran des domaines."
              >
                <Input
                  id="ps-cname"
                  value={input.portalCnameTarget}
                  onChange={(e) => update("portalCnameTarget", e.target.value)}
                  placeholder="portail.edilumen.fr"
                  aria-invalid={Boolean(errors.portalCnameTarget)}
                  autoComplete="off"
                  spellCheck={false}
                />
                {errors.portalCnameTarget ? (
                  <p className="mt-1.5 text-sm text-destructive">{errors.portalCnameTarget}</p>
                ) : null}
              </Field>

              <Field
                label="Plafond IA par défaut (jetons par mois)"
                htmlFor="ps-tokens"
                hint="Posé à chaque nouvelle collectivité ; modifiable ensuite sur sa page. Vide : la collectivité reste « non décidée », donc illimitée, jusqu'à votre geste."
              >
                <Input
                  id="ps-tokens"
                  inputMode="numeric"
                  value={input.defaultAiMonthlyTokens}
                  onChange={(e) => update("defaultAiMonthlyTokens", e.target.value)}
                  placeholder="ex. 2 000 000"
                  aria-invalid={Boolean(errors.defaultAiMonthlyTokens)}
                />
                {errors.defaultAiMonthlyTokens ? (
                  <p className="mt-1.5 text-sm text-destructive">{errors.defaultAiMonthlyTokens}</p>
                ) : null}
              </Field>

              {save.error ? (
                <p className="text-sm text-destructive">{(save.error as Error).message}</p>
              ) : null}

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Enregistrer
                </Button>
                {save.isSuccess && !dirty ? (
                  <p className="text-sm text-success">Réglages enregistrés.</p>
                ) : null}
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <RefreshCw className="size-5 text-primary" />
            <div>
              <CardTitle className="text-base">Organisations existantes</CardTitle>
              <CardDescription>
                Une collectivité créée avant ces réglages n'a reçu ni sous-domaine ni plafond.
                Rejouer le provisioning pose ce qui manque, sans toucher à ce qui existe.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={provision.isPending}
              onClick={() =>
                provision.mutate(undefined, { onSuccess: (result) => setReport(result) })
              }
            >
              {provision.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Rejouer le provisioning
            </Button>
          </div>
          {provision.error ? (
            <p className="text-sm text-destructive">{(provision.error as Error).message}</p>
          ) : report ? (
            <p className="text-sm text-muted-foreground">{provisionReportLabel(report)}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ce qui se règle ailleurs</CardTitle>
          <CardDescription>
            Les secrets de la plateforme ne vivent pas en base : la clé du fournisseur IA, le
            relais de messagerie de repli et le hook d'authentification se posent dans le projet
            Supabase, une fois. La procédure complète est dans docs/onboarding.md.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
