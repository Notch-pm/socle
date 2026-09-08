import * as React from "react";
import { AppWindow, Globe, TriangleAlert, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiKeysList } from "@/features/superadmin/organizations/ApiKeysList";
import { useApplications, useCreateApplication } from "./useApplications";

const APPLICATION_ID_RE = /^[a-z][a-z0-9_-]{1,31}$/;

/**
 * Les applications de la gamme, et la clé de chacune.
 *
 * Une clé par application, émise une fois, posée une fois dans le projet de
 * l'application. Son périmètre n'est pas « tout » : c'est la liste des
 * collectivités ABONNÉES à l'application, cochées sur la fiche de chaque
 * client (section « Applications souscrites »). Aucun secret ne circule à
 * l'arrivée d'un client.
 *
 * Remplace la page « Clés plateforme » : les clés plateforme existent toujours
 * (`organization_id IS NULL`), mais elles sont désormais rangées par
 * application, et une clé sans application est refusée par les API.
 */
export function ApplicationsPage() {
  const { data: applications, isLoading } = useApplications();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Applications</h1>
        <p className="text-muted-foreground">
          Les applications de la gamme et la clé de chacune. Une clé voit les collectivités
          abonnées à son application, et seulement elles.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Globe className="size-5 text-primary" />
            <div>
              <CardTitle className="text-base">Une clé par application, bornée par abonnement</CardTitle>
              <CardDescription>
                La clé d'une application est posée une fois dans son projet. À l'arrivée d'un
                client, cochez ses applications sur sa fiche : rien d'autre à transmettre.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              Avec l'accès « Usagers », la clé d'une application lit et écrit les référentiels
              d'usagers de <strong>toutes ses collectivités abonnées</strong>. Pour un partenaire
              ou un client, créez plutôt une clé depuis la page de son organisation (section
              « API publique ») : son périmètre sera borné à cette organisation et sa descendance.
            </p>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Référentiel (public-api)</span> : les
              collectivités abonnées ; les géométries de quartiers exigent le paramètre{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">organization_id</code>.
            </li>
            <li>
              <span className="font-medium text-foreground">Usagers et assistant IA</span> : chaque
              appel désigne l'organisation servie par l'en-tête{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">X-Organization-Id</code>{" "}
              — hors abonnement, la réponse est 404.
            </li>
          </ul>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-lg bg-muted/40" />
      ) : (
        (applications ?? []).map((app) => (
          <section key={app.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <AppWindow className="size-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-lg font-semibold">{app.name}</h2>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{app.id}</code>
              <Badge variant={app.scope === "plateforme" ? "secondary" : "outline"}>
                {app.scope === "plateforme" ? "Toute la plateforme" : "Collectivités abonnées"}
              </Badge>
            </div>
            <ApiKeysList owner={null} application={app.id} />
          </section>
        ))
      )}

      {/* Les clés plateforme d'avant le registre : refusées tant qu'elles ne
          sont pas rattachées. Vide, la section se réduit à son titre. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">À rattacher</h2>
        <ApiKeysList owner={null} application={null} />
      </section>

      <NewApplicationCard />
    </div>
  );
}

/**
 * Ajouter une application au registre — un identifiant (celui que la clé
 * portera, `api_keys.consumer`) et un nom. Toujours de scope `abonnement` :
 * le scope `plateforme` est réservé au Socle lui-même, il ne se crée pas ici.
 */
function NewApplicationCard() {
  const create = useCreateApplication();
  const [id, setId] = React.useState("");
  const [name, setName] = React.useState("");
  const idValue = id.trim().toLowerCase();
  const idValid = APPLICATION_ID_RE.test(idValue);
  const canSubmit = idValid && name.trim().length > 0 && !create.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    create.mutate(
      { id: idValue, name: name.trim() },
      {
        onSuccess: () => {
          setId("");
          setName("");
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nouvelle application</CardTitle>
        <CardDescription>
          L'identifiant est celui que la clé portera et que le journal IA impute. Minuscules,
          chiffres, tiret ou souligné, 2 à 32 caractères.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <Field label="Identifiant" htmlFor="new-app-id">
            <Input
              id="new-app-id"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="ariane"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="Nom" htmlFor="new-app-name">
            <Input
              id="new-app-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ariane — rendez-vous"
            />
          </Field>
          <Button type="submit" disabled={!canSubmit}>
            <Plus className="size-4" />
            Ajouter
          </Button>
          {id.trim() !== "" && !idValid ? (
            <p className="w-full text-xs text-destructive">
              Identifiant invalide : 2 à 32 caractères, commençant par une lettre minuscule.
            </p>
          ) : null}
          {create.error ? (
            <p className="w-full text-sm text-destructive">{(create.error as Error).message}</p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
