import * as React from "react";
import { Loader2, Mail, Send, Server } from "lucide-react";
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
  useSaveSmtpSettings,
  useSendTestEmail,
  type SmtpForm,
} from "@/features/superadmin/organizations/useSmtpSettings";

const defaultForm: SmtpForm = {
  host: "",
  port: 587,
  username: "",
  password: "",
  from_email: "",
  from_name: "",
  use_tls: true,
};

export function SmtpSettingsSection({ organizationId }: { organizationId: string }) {
  const { data: settings, isLoading } = useSmtpSettings(organizationId);
  const saveSettings = useSaveSmtpSettings(organizationId, settings?.id);
  const sendTest = useSendTestEmail();

  const [form, setForm] = React.useState<SmtpForm>(defaultForm);
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

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
                onChange={(e) => setForm({ ...form, port: parseInt(e.target.value, 10) || 587 })}
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
              <p className="text-xs text-muted-foreground">Connexion sécurisée au serveur SMTP</p>
            </div>
            <Switch
              checked={form.use_tls}
              onCheckedChange={(checked) => setForm({ ...form, use_tls: checked })}
            />
          </div>

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
              disabled={!settings?.id}
            >
              <Send className="size-4" />
              Envoyer un mail de test
            </Button>
          </div>
          {!settings?.id ? (
            <p className="text-xs text-muted-foreground">
              Enregistrez la configuration avant de pouvoir envoyer un email de test.
            </p>
          ) : null}
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
