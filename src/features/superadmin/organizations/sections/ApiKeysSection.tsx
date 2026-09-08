import { KeyRound, ExternalLink } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ApiKeysList } from "@/features/superadmin/organizations/ApiKeysList";

const API_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-api`;
const CONTACTS_API_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contacts-api`;

/**
 * Section « API publique » d'une organisation racine : présentation des API de
 * la gamme + clés rattachées à cette organisation (périmètre = elle et sa
 * descendance) — des clés de PARTENAIRES. Les applications de la gamme (Nora,
 * Iris, Clara) ne prennent pas de clé ici : chacune a la sienne, sur la page
 * `/superadmin/applications`, et voit cette collectivité dès qu'elle y est
 * abonnée (section « Applications souscrites »).
 */
export function ApiKeysSection({ organizationId }: { organizationId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <KeyRound className="size-5 text-primary" />
            <div>
              <CardTitle className="text-base">Clés de partenaires</CardTitle>
              <CardDescription>
                Délivrez des clés pour qu'un partenaire consomme le référentiel (lecture), les
                usagers (lecture/écriture), le relais d'envoi ou l'assistant IA de cette
                organisation et de sa descendance — jamais au-delà. Les applications de la gamme
                (Nora, Iris, Clara) n'ont pas besoin de clé ici : cochez-les dans « Applications
                souscrites ». Usage serveur-à-serveur ; les accès se choisissent à la création.
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
