import * as React from "react";
import { ImageOff, Loader2, Palette, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  DEFAULT_COLOR_PICKER,
  brandingUpdateFromValues,
  brandingValuesFromOrganization,
  colorFieldError,
  isBrandingEmpty,
  normalizeHexColor,
  previewBranding,
  type BrandingValues,
  type ResolvedBranding,
} from "@/features/organizations/branding";
import {
  useParentBranding,
  useSaveBranding,
  type ParentBranding,
} from "@/features/organizations/useBranding";
import type { Organization } from "@/features/superadmin/organizations/useOrganizationsAdmin";

export const BRANDING_INHERIT_SWITCH_LABEL = "Utiliser la charte graphique de l'organisme parent";

function toResolved(parent: ParentBranding | null | undefined): ResolvedBranding | null {
  if (!parent) return null;
  return {
    logoUrl: parent.logo_url,
    logoWhiteUrl: parent.logo_white_url,
    primaryColor: parent.primary_color,
    secondaryColor: parent.secondary_color,
  };
}

/** Saisie d'une couleur : nuancier natif + notation hexadécimale, les deux liés. */
function ColorField({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <Field label={label} htmlFor={id} error={error} hint="Notation hexadécimale, ex. #1f8a5b">
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} — nuancier`}
          value={normalizeHexColor(value) ?? DEFAULT_COLOR_PICKER}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-input bg-background p-1"
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#1f8a5b"
        />
        {value.trim() ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Effacer : ${label}`}
            onClick={() => onChange("")}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
    </Field>
  );
}

/**
 * Vignette de logo. Un logo de collectivité est un bandeau : hauteur fixe,
 * largeur libre (même traitement que dans l'en-tête de l'application). Une URL
 * qui ne charge pas le dit — sans quoi on ne distingue pas « pas de logo » de
 * « logo cassé ».
 */
function LogoPreview({
  url,
  label,
  dark,
}: {
  url: string | null;
  label: string;
  dark?: boolean;
}) {
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => setBroken(false), [url]);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div
        className={cn(
          "flex h-20 items-center justify-center rounded-lg border border-border px-4",
          dark ? "bg-slate-800" : "bg-white",
        )}
      >
        {!url ? (
          <span className={cn("text-xs", dark ? "text-slate-400" : "text-muted-foreground")}>
            Non défini
          </span>
        ) : broken ? (
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs",
              dark ? "text-slate-400" : "text-muted-foreground",
            )}
          >
            <ImageOff className="size-4" />
            Image introuvable
          </span>
        ) : (
          <img
            src={url}
            alt={label}
            onError={() => setBroken(true)}
            className="max-h-12 w-auto object-contain"
          />
        )}
      </div>
    </div>
  );
}

function ColorChip({ label, color }: { label: string; color: string | null }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-lg border border-border p-2">
        <span
          aria-hidden="true"
          className="size-8 shrink-0 rounded-md border border-border"
          style={color ? { backgroundColor: color } : undefined}
        />
        <span className="text-sm text-muted-foreground">{color ?? "Non définie"}</span>
      </div>
    </div>
  );
}

/** Ce que verront les applications de la gamme : la charte **applicable**. */
function BrandingPreview({ branding }: { branding: ResolvedBranding }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-sm font-medium">Aperçu</p>
      {isBrandingEmpty(branding) ? (
        <p className="text-sm text-muted-foreground">
          Aucun élément de charte graphique n'est défini : les applications de la gamme
          utiliseront leur habillage par défaut.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <LogoPreview url={branding.logoUrl} label="Logo couleur" />
          <LogoPreview url={branding.logoWhiteUrl} label="Logo blanc" dark />
          <ColorChip label="Couleur principale" color={branding.primaryColor} />
          <ColorChip label="Couleur secondaire" color={branding.secondaryColor} />
        </div>
      )}
    </div>
  );
}

/**
 * Charte graphique d'une organisation — composant partagé par les deux zones
 * (onglet de `OrganizationEditorPage` côté admin, section d'`OrgSettingsPage`
 * côté superadmin), comme `SmtpSettingsSection`.
 *
 * ⚠️ Le logo couleur (`logo_url`) vit ici, plus dans « Informations de base » :
 * c'est un élément de charte, gouverné par le même commutateur d'héritage que
 * les trois autres.
 */
export function BrandingSection({ organization }: { organization: Organization }) {
  const hasParent = organization.parent_id !== null;
  const { data: parentBranding, isLoading: parentLoading } = useParentBranding(
    organization.id,
    hasParent,
  );
  const saveBranding = useSaveBranding(organization.id);

  const [values, setValues] = React.useState<BrandingValues>(() =>
    brandingValuesFromOrganization(organization),
  );

  const set = <K extends keyof BrandingValues>(key: K, value: BrandingValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    saveBranding.reset();
  };

  const primaryError = colorFieldError(values.primaryColor) ?? undefined;
  const secondaryError = colorFieldError(values.secondaryColor) ?? undefined;
  const hasError = Boolean(primaryError || secondaryError);

  const parent = toResolved(parentBranding);
  const preview = previewBranding(values, parent);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (hasError) return;
    saveBranding.mutate(brandingUpdateFromValues(values, hasParent));
  }

  if (parentLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Palette className="size-5 text-primary" />
            <div>
              <CardTitle className="text-base">Charte graphique</CardTitle>
              <CardDescription>
                Logos et couleurs de cette organisation, repris par les applications de la gamme.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {hasParent ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">{BRANDING_INHERIT_SWITCH_LABEL}</p>
                  <p className="text-xs text-muted-foreground">
                    La charte de l'organisation parente s'applique, ses modifications futures
                    comprises. Désactivez pour définir une charte propre à cette organisation.
                  </p>
                </div>
                <Switch
                  aria-label={BRANDING_INHERIT_SWITCH_LABEL}
                  checked={values.inheritParent}
                  onCheckedChange={(checked) => set("inheritParent", checked)}
                />
              </div>
              {values.inheritParent ? (
                parentBranding?.configured ? (
                  <p className="text-sm text-muted-foreground">
                    Charte héritée de <strong>{parentBranding.source_organization_name}</strong>.
                    Toute modification faite à ce niveau s'appliquera automatiquement ici.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Aucune charte graphique n'est définie au-dessus de cette organisation. Elle
                    s'appliquera ici dès qu'elle le sera, ou vous pouvez en définir une propre.
                  </p>
                )
              ) : null}
            </div>
          ) : null}

          {values.inheritParent ? null : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Logo couleur (URL)"
                  htmlFor="cg-logo"
                  hint="Adresse d'une image déjà hébergée"
                >
                  <Input
                    id="cg-logo"
                    type="url"
                    value={values.logoUrl}
                    onChange={(e) => set("logoUrl", e.target.value)}
                    placeholder="https://…/logo.png"
                  />
                </Field>
                <Field
                  label="Logo blanc (URL)"
                  htmlFor="cg-logo-blanc"
                  hint="Version monochrome claire, pour les fonds sombres"
                >
                  <Input
                    id="cg-logo-blanc"
                    type="url"
                    value={values.logoWhiteUrl}
                    onChange={(e) => set("logoWhiteUrl", e.target.value)}
                    placeholder="https://…/logo-blanc.svg"
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <ColorField
                  id="cg-couleur-principale"
                  label="Couleur principale"
                  value={values.primaryColor}
                  onChange={(v) => set("primaryColor", v)}
                  error={primaryError}
                />
                <ColorField
                  id="cg-couleur-secondaire"
                  label="Couleur secondaire"
                  value={values.secondaryColor}
                  onChange={(v) => set("secondaryColor", v)}
                  error={secondaryError}
                />
              </div>
            </>
          )}

          <BrandingPreview branding={preview} />

          {saveBranding.isError ? (
            <p className="text-sm text-destructive">{(saveBranding.error as Error).message}</p>
          ) : null}

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={saveBranding.isPending || hasError}>
              {saveBranding.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
            {saveBranding.isSuccess && !saveBranding.isPending ? (
              <p className="text-sm text-success">Charte graphique enregistrée.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
