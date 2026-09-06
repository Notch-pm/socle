import * as React from "react";
import { Languages as LanguagesIcon, Loader2, Search } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import {
  PIVOT_LANGUAGE,
  enabledLanguagesForWrite,
  languageLabel,
  sortedLanguages,
  type LanguageDef,
  type LanguageGroup,
} from "@/features/languages/languages";
import {
  useOrganizationLanguages,
  useSaveOrganizationLanguages,
} from "@/features/languages/useOrganizationLanguages";
import type { Organization } from "@/features/superadmin/organizations/useOrganizationsAdmin";

export const LANGUAGES_ROOT_ONLY_MESSAGE =
  "Les langues se paramètrent au niveau de l'organisation principale (racine).";

const GROUPS: { key: LanguageGroup; title: string; description: string }[] = [
  {
    key: "monde",
    title: "Langues mondiales",
    description: "Grandes langues de communication et langues les plus présentes aux guichets.",
  },
  {
    key: "france",
    title: "Langues régionales de France",
    description: "Métropole et outre-mer, dans l'esprit de la liste des « langues de France ».",
  },
];

/** Une langue du catalogue, cochable. Le français est coché et verrouillé. */
function LanguageRow({
  language,
  checked,
  onToggle,
}: {
  language: LanguageDef;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const pivot = language.code === PIVOT_LANGUAGE;
  const id = `langue-${language.code}`;
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm transition-colors",
        pivot ? "bg-muted/40" : "cursor-pointer hover:border-primary/30 hover:bg-muted/30",
      )}
    >
      <input
        id={id}
        type="checkbox"
        className="size-4 shrink-0 accent-[hsl(var(--primary))]"
        checked={checked}
        disabled={pivot}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span className="flex-1 truncate">{language.label}</span>
      {pivot ? (
        <Badge variant="muted" title="Langue de saisie du référentiel">
          Pivot
        </Badge>
      ) : (
        <span className="font-mono text-xs text-muted-foreground">{language.code}</span>
      )}
    </label>
  );
}

/**
 * Langues d'une collectivité — composant partagé par les deux zones (onglet de
 * `OrganizationEditorPage` côté admin, section d'`OrgSettingsPage` côté
 * superadmin), comme `BrandingSection`.
 *
 * Le réglage n'existe que sur une **organisation principale** : les langues dans
 * lesquelles une collectivité s'adresse à ses usagers ne se découpent pas par
 * service. Une sous-organisation le dit et renvoie à sa racine — le trigger
 * `enforce_languages_root_org` tient la même ligne en base.
 */
export function LanguagesSection({ organization }: { organization: Organization }) {
  const isRoot = organization.parent_id === null;
  const { data: enabled, isLoading } = useOrganizationLanguages(isRoot ? organization.id : undefined);
  const saveLanguages = useSaveOrganizationLanguages(organization.id);

  const [selected, setSelected] = React.useState<Set<string> | null>(null);
  const [search, setSearch] = React.useState("");

  // Une fois la sélection enregistrée connue, elle amorce l'état du formulaire.
  React.useEffect(() => {
    if (enabled && selected === null) setSelected(new Set(enabled));
  }, [enabled, selected]);

  if (!isRoot) {
    return <EmptyState message={LANGUAGES_ROOT_ONLY_MESSAGE} />;
  }

  if (isLoading || selected === null) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const toggle = (code: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current ?? []);
      if (checked) next.add(code);
      else next.delete(code);
      return next;
    });
    saveLanguages.reset();
  };

  const needle = search.trim().toLowerCase();
  const matches = (language: LanguageDef) =>
    needle === "" ||
    language.label.toLowerCase().includes(needle) ||
    language.code.includes(needle);

  const active = enabledLanguagesForWrite(selected);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveLanguages.mutate(active);
      }}
      className="flex flex-col gap-6"
    >
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <LanguagesIcon className="size-5 text-primary" />
            <div>
              <CardTitle className="text-base">Langues</CardTitle>
              <CardDescription>
                Langues dans lesquelles cette collectivité s'adresse à ses usagers. Les libellés des
                démarches et des catégories se traduisent dans chacune d'elles.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-sm">
              <span className="font-medium">{active.length}</span>{" "}
              {active.length > 1 ? "langues actives" : "langue active"} :{" "}
              {active.map((code) => languageLabel(code)).join(", ")}
            </p>
            <p className="text-xs text-muted-foreground">
              Le français est la langue de saisie du référentiel : il reste toujours actif.
              Désactiver une langue la retire des écrans de traduction, mais{" "}
              <strong>ne supprime pas</strong> les traductions déjà saisies — la réactiver les
              rendra telles quelles.
            </p>
          </div>

          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Rechercher une langue"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une langue…"
              className="pl-9"
            />
          </div>

          {GROUPS.map((group) => {
            const languages = sortedLanguages(group.key).filter(matches);
            return (
              <section key={group.key} className="flex flex-col gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{group.title}</h3>
                  <p className="text-xs text-muted-foreground">{group.description}</p>
                </div>
                {languages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune langue ne correspond.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {languages.map((language) => (
                      <LanguageRow
                        key={language.code}
                        language={language}
                        checked={selected.has(language.code) || language.code === PIVOT_LANGUAGE}
                        onToggle={(checked) => toggle(language.code, checked)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          {saveLanguages.isError ? (
            <p className="text-sm text-destructive">{(saveLanguages.error as Error).message}</p>
          ) : null}

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={saveLanguages.isPending}>
              {saveLanguages.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
            {saveLanguages.isSuccess && !saveLanguages.isPending ? (
              <p className="text-sm text-success">Langues enregistrées.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
