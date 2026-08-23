import * as React from "react";
import { Loader2, Mail, Send, Server, TriangleAlert } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useSmtpSettings,
  useParentSmtpSettings,
  useSaveSmtpSettings,
  useSendTestEmail,
  type ParentSmtpSettings,
  type SmtpForm,
} from "@/features/superadmin/organizations/useSmtpSettings";

const blankForm: Omit<SmtpForm, "inherit_parent"> = {
  host: "",
  port: 587,
  username: "",
  password: "",
  from_email: "",
  from_name: "",
  use_tls: true,
};

export const INHERIT_SWITCH_LABEL = "Utiliser la configuration de l'organisme parent";

/** Résumé en lecture seule du relais hérité — jamais le mot de passe du parent. */
function InheritedSummary({ parent }: { parent: ParentSmtpSettings }) {
  const rows: [string, string][] = [
    ["Serveur", `${parent.host}:${parent.port}`],
    ["Identifiant", parent.username || "aucun"],
    [
      "Expéditeur",
      parent.from_name ? `${parent.from_name} <${parent.from_email}>` : parent.from_email,
    ],
    ["TLS", parent.use_tls ? "Oui" : "Non"],
  ];
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-sm">
        Configuration héritée de <strong>{parent.source_organization_name}</strong>. Toute
        modification faite à ce niveau s'appliquera automatiquement ici.
      </p>
      <dl className="grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="font-medium">{label} :</dt>
            <dd className="truncate">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function SmtpSettingsSection({
  organizationId,
  parentOrganizationId,
}: {
  organizationId: string;
  /** `null` = organisation principale : elle n'hérite de personne. */
  parentOrganizationId: string | null;
}) {
  const hasParent = parentOrganizationId !== null;
  const { data: settings, isLoading } = useSmtpSettings(organizationId);
  const { data: parentSmtp, isLoading: parentLoading } = useParentSmtpSettings(
    organizationId,
    hasParent,
  );
  const saveSettings = useSaveSmtpSettings(organizationId, settings?.id);
  const sendTest = useSendTestEmail();

  // Une sous-organisation sans ligne hérite : c'est le défaut du formulaire.
  const [form, setForm] = React.useState<SmtpForm>({ ...blankForm, inherit_parent: hasParent });
  const [testDialogOpen, setTestDialogOpen] = React.useState(false);
  const [testEmail, setTestEmail] = React.useState("");

  React.useEffect(() => {
    if (settings) {
      setForm({
        host: settings.host,
        port: settings.port,
        username: settings.username,
        password: settings.password,
        from_email: settings.from_email,
        from_name: settings.from_name,
        use_tls: settings.use_tls,
        inherit_parent: settings.inherit_parent,
      });
    }
  }, [settings]);

  function handleSendTest() {
    if (!testEmail) return;
    sendTest.mutate(
      { to: testEmail, organizationId },
      {
        onSuccess: () => {
          setTestDialogOpen(false);
          setTestEmail("");
        },
      },
    );
  }

  if (isLoading || parentLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Le test passe par le serveur, qui résout l'état **enregistré** : on n'active
  // pas le bouton sur la foi d'un commutateur pas encore enregistré.
  const savedInherits = settings ? settings.inherit_parent : hasParent;
  const canSendTest = savedInherits ? Boolean(parentSmtp?.configured) : Boolean(settings?.id);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Server className="size-5 text-primary" />
            <div>
              <CardTitle className="text-base">Serveur SMTP</CardTitle>
              <CardDescription>
                Configurez le serveur SMTP utilisé pour l'envoi des emails de cette organisation
                (invitations, réinitialisation de mot de passe).
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {hasParent ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">{INHERIT_SWITCH_LABEL}</p>
                  <p className="text-xs text-muted-foreground">
                    Le relais de l'organisation parente s'applique, ses modifications futures
                    comprises. Désactivez pour saisir une configuration propre à cette
                    organisation.
                  </p>
                </div>
                <Switch
                  aria-label={INHERIT_SWITCH_LABEL}
                  checked={form.inherit_parent}
                  onCheckedChange={(checked) => setForm({ ...form, inherit_parent: checked })}
                />
              </div>
              {form.inherit_parent ? (
                parentSmtp?.configured ? (
                  <InheritedSummary parent={parentSmtp} />
                ) : (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                  >
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    <p>
                      Aucune configuration exploitable au-dessus de cette organisation : aucun
                      email ne partira tant que l'organisation principale n'aura pas de serveur
                      SMTP, ou que vous n'aurez pas saisi une configuration propre.
                    </p>
                  </div>
                )
              ) : null}
            </div>
          ) : null}

          {form.inherit_parent ? null : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Hôte SMTP" htmlFor="smtp-host">
                  <Input
                    id="smtp-host"
                    placeholder="smtp.example.com"
                    value={form.host}
                    onChange={(e) => setForm({ ...form, host: e.target.value })}
                  />
                </Field>
                <Field label="Port" htmlFor="smtp-port">
                  <Input
                    id="smtp-port"
                    type="number"
                    placeholder="587"
                    value={form.port}
                    onChange={(e) =>
                      setForm({ ...form, port: parseInt(e.target.value, 10) || 587 })
                    }
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Identifiant" htmlFor="smtp-username">
                  <Input
                    id="smtp-username"
                    placeholder="user@example.com"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                  />
                </Field>
                <Field label="Mot de passe" htmlFor="smtp-password">
                  <Input
                    id="smtp-password"
                    type="password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email expéditeur" htmlFor="smtp-from-email">
                  <Input
                    id="smtp-from-email"
                    placeholder="noreply@example.com"
                    value={form.from_email}
                    onChange={(e) => setForm({ ...form, from_email: e.target.value })}
                  />
                </Field>
                <Field label="Nom expéditeur" htmlFor="smtp-from-name">
                  <Input
                    id="smtp-from-name"
                    placeholder="Mon organisation"
                    value={form.from_name}
                    onChange={(e) => setForm({ ...form, from_name: e.target.value })}
                  />
                </Field>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Utiliser TLS</p>
                  <p className="text-xs text-muted-foreground">
                    Connexion sécurisée au serveur SMTP
                  </p>
                </div>
                <Switch
                  aria-label="Utiliser TLS"
                  checked={form.use_tls}
                  onCheckedChange={(checked) => setForm({ ...form, use_tls: checked })}
                />
              </div>
            </>
          )}

          {saveSettings.isError ? (
            <p className="text-sm text-destructive">{(saveSettings.error as Error).message}</p>
          ) : null}

          <div className="flex gap-3 pt-2">
            <Button onClick={() => saveSettings.mutate(form)} disabled={saveSettings.isPending}>
              {saveSettings.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setTestDialogOpen(true)}
              disabled={!canSendTest}
            >
              <Send className="size-4" />
              Envoyer un mail de test
            </Button>
          </div>
          {canSendTest ? null : (
            <p className="text-xs text-muted-foreground">
              Enregistrez la configuration avant de pouvoir envoyer un email de test.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="size-5" />
              Envoyer un email de test
            </DialogTitle>
          </DialogHeader>
          <Field label="Adresse email du destinataire" htmlFor="test-email">
            <Input
              id="test-email"
              type="email"
              placeholder="destinataire@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
          </Field>
          {sendTest.isError ? (
            <p className="text-sm text-destructive">{(sendTest.error as Error).message}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSendTest} disabled={sendTest.isPending || !testEmail}>
              {sendTest.isPending ? "Envoi…" : "Envoyer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
