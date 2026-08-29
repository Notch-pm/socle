import * as React from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Field } from "@/components/ui/field";
import { AiUsageOverview } from "./AiUsageOverview";
import { useAdminRootOrganizations } from "./useAdminRootOrganizations";

/**
 * Page admin `/consommation-ia` — la CONSULTATION de la consommation IA.
 *
 * ⚠️ AUCUNE ÉCRITURE, ET C'EST LA RAISON D'ÊTRE DE L'ÉCRAN. Le plafond se
 * négocie avec l'éditeur ; le rendre modifiable ici reviendrait à le rendre
 * levable par celui qu'il borne. Le serveur tient la même ligne —
 * `set_ai_usage_quota` garde `is_super_admin()` à l'intérieur de la fonction,
 * et les policies `ai_usage_*` n'ouvrent que le SELECT. L'écran ne fait donc
 * que refléter le RLS, comme partout dans le Socle.
 *
 * Ce que la collectivité vient y chercher : où elle en est de son mois, quelle
 * application dépense, et quand le crédit repart. C'est ce qui lui permet de
 * demander un relèvement AVANT de buter sur le refus, plutôt qu'après.
 *
 * Le plafond vit sur une organisation PRINCIPALE : le sélecteur ne propose donc
 * que des racines (masqué s'il n'y en a qu'une), motif déjà appliqué à
 * `/quartiers` et `/types-pieces`.
 */
export function AiUsagePage() {
  const { data: organizations, isLoading, isError } = useAdminRootOrganizations();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const roots = organizations ?? [];
  const organizationId = selectedId ?? roots[0]?.id ?? null;

  return (
    <div className="p-6">
      <PageHeader
        title="Consommation IA"
        subtitle="Les jetons consommés par l'assistant IA pour votre collectivité, toutes applications confondues. Consultation seule : le plafond est réglé par l'éditeur."
      />

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-lg bg-muted/40" />
      ) : isError ? (
        <EmptyState message="La liste des organisations n'a pas pu être lue. Réessayez dans un instant." />
      ) : !organizationId ? (
        <EmptyState message="Cette page est réservée aux administrateurs d'une organisation principale." />
      ) : (
        <div className="flex flex-col gap-4">
          {roots.length > 1 && (
            <Field label="Organisation" htmlFor="ai-usage-org" className="max-w-sm">
              <select
                id="ai-usage-org"
                value={organizationId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {roots.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <AiUsageOverview organizationId={organizationId} />
        </div>
      )}
    </div>
  );
}
