import { KeyRound, ExternalLink } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ApiKeysList } from "@/features/superadmin/organizations/ApiKeysList";

const API_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-api`;
const CONTACTS_API_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contacts-api`;

/**
 * Section « API publique » d'une organisation racine : présentation des deux API
 * de la gamme + clés rattachées à cette organisation (périmètre = elle et sa
 * descendance). Les clés **plateforme** (périmètre global) se gèrent sur la page
 * dédiée `/superadmin/cles-plateforme`.
 */
export function ApiKeysSection({ organizationId }: { organizationId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <KeyRound className="size-5 text-primary" />
            <div>
              <CardTitle className="text-base">APIs de la gamme</CardTitle>
              <CardDescription>
                Délivrez des clés pour que d'autres applications (Clara, Ariane, Iris, partenaires)
                consomment le référentiel (lecture) et le référentiel des usagers
                (lecture/écriture) de cette organisation et de sa descendance. Les clés sont
                destinées à un usage serveur-à-serveur ; leurs accès se choisissent à la création.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <div className="flex flex-col gap-2">
            <span className="font-medium">Référentiel (lecture seule)</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Base :</span>
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
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-medium">Usagers (lecture + écriture, scope « contacts »)</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Base :</span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{CONTACTS_API_BASE_URL}</code>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <a
                href="/api-doc-usagers"
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center gap-1.5 text-primary hover:underline"
              >
                Documentation (Swagger) <ExternalLink className="size-3.5" />
              </a>
              <a
                href={`${CONTACTS_API_BASE_URL}/openapi.json`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center gap-1.5 text-primary hover:underline"
              >
                Contrat OpenAPI (JSON) <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      <ApiKeysList owner={organizationId} />
    </div>
  );
}
