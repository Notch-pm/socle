import * as React from "react";
import { Link } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import logo from "@/assets/logo-edilumen.svg";

export function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reinitialiser-mot-de-passe`,
    });
    setSubmitting(false);
    // Always show the same confirmation, whether or not the email exists —
    // avoids leaking which addresses have an account.
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <div className="w-full max-w-[420px] rounded-lg border border-border bg-card p-8 text-center shadow-socle-lg">
          <MailCheck className="mx-auto mb-4 size-12 text-success" />
          <h1 className="text-lg font-semibold">Vérifiez votre boîte mail</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Si un compte existe pour {email}, un lien de réinitialisation vient d'être envoyé.
          </p>
          <Button asChild className="mt-6">
            <Link to="/login">Retour à la connexion</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-[420px] rounded-lg border border-border bg-card p-8 shadow-socle-lg">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src={logo} alt="Edilumen" className="h-8" />
          <p className="text-sm text-muted-foreground">
            Indiquez votre email pour recevoir un lien de réinitialisation.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Email" htmlFor="forgot-email">
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Button type="submit" size="lg" disabled={submitting} className="mt-2">
            {submitting ? "Envoi…" : "Envoyer le lien"}
          </Button>

          <Link to="/login" className="text-center text-sm text-muted-foreground hover:text-foreground">
            Retour à la connexion
          </Link>
        </form>
      </div>
    </div>
  );
}
