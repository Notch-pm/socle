import { Globe, TriangleAlert } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ApiKeysList } from "@/features/superadmin/organizations/ApiKeysList";

/**
 * Clés API **plateforme** (`api_keys.organization_id IS NULL`) : périmètre =
 * toutes les organisations, toutes racines confondues. Liaison unique avec une
 * application de la gamme elle-même multi-tenant (Clara). Elles n'apparaissent
 * sur la page d'aucune organisation — c'est ici, et seulement ici, qu'on les
 * voit, les crée et les révoque.
 */
export function PlatformApiKeysPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Clés plateforme</h1>
        <p className="text-muted-foreground">
          Clés d'API dont le périmètre couvre toutes les organisations, tous clients confondus.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Globe className="size-5 text-primary" />
            <div>
              <CardTitle className="text-base">Périmètre global</CardTitle>
              <CardDescription>
                Une clé plateforme n'est rattachée à aucune organisation : elle voit l'ensemble du
                référentiel. À réserver à une application de la gamme elle-même multi-tenant
                (Clara) qui sert plusieurs clients avec une seule liaison.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              Avec l'accès « Usagers », une clé plateforme lit et écrit les référentiels d'usagers
              de <strong>toutes</strong> les organisations. Pour un partenaire ou un client, créez
              plutôt une clé depuis la page de son organisation (section « API publique ») : son
              périmètre sera borné à cette organisation et sa descendance.
            </p>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Référentiel (public-api)</span> : toutes
              les organisations ; les géométries de quartiers exigent le paramètre{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">organization_id</code>.
            </li>
            <li>
              <span className="font-medium text-foreground">Usagers (contacts-api)</span> : chaque
              appel désigne l'organisation servie par l'en-tête{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">X-Organization-Id</code>{" "}
              (sinon 400).
            </li>
          </ul>
        </CardContent>
      </Card>

      <ApiKeysList owner={null} />
    </div>
  );
}
