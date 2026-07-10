import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import logo from "@/assets/logo-edilumen.svg";

type FlowType = "invite" | "recovery";

const COPY: Record<FlowType, { intro: string; success: string; cta: string }> = {
  invite: {
    intro: "Choisissez un mot de passe pour accéder à votre espace.",
    success: "Votre mot de passe a été défini avec succès. Vous pouvez maintenant vous connecter.",
    cta: "Activer mon compte",
  },
  recovery: {
    intro: "Choisissez un nouveau mot de passe pour votre compte.",
    success: "Votre mot de passe a été mis à jour avec succès. Vous pouvez maintenant vous connecter.",
    cta: "Réinitialiser mon mot de passe",
  },
};

/** Handles both the invite link (new account) and the password-reset link — same
 * underlying Supabase flow (verify a token, then updateUser({password})), only
 * the copy differs. */
export function SetPasswordPage() {
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tokenHash, setTokenHash] = React.useState("");
  const [flowType, setFlowType] = React.useState<FlowType>("invite");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  React.useEffect(() => {
    const token = searchParams.get("token_hash");
    const type = searchParams.get("type");

    if (type === "recovery") setFlowType("recovery");

    if (token && type) {
      setTokenHash(token);
      setReady(true);
      return;
    }

    const hash = window.location.hash;
    if (hash.includes("type=recovery")) setFlowType("recovery");
    if (hash.includes("type=invite") || hash.includes("type=recovery") || hash.includes("access_token")) {
      setReady(true);
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);

    if (tokenHash) {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: flowType,
      });

      if (verifyError) {
        setError("Lien invalide ou expiré. Demandez un nouveau lien.");
        setLoading(false);
        return;
      }
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    await supabase.auth.signOut();
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
  }

  const copy = COPY[flowType];

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <div className="w-full max-w-[420px] rounded-lg border border-border bg-card p-8 text-center shadow-socle-lg">
          <CheckCircle2 className="mx-auto mb-4 size-12 text-success" />
          <h1 className="text-lg font-semibold">C'est fait !</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.success}</p>
          <Button className="mt-6" onClick={() => navigate("/login")}>
            Se connecter
          </Button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <div className="w-full max-w-[420px] rounded-lg border border-border bg-card p-8 text-center shadow-socle-lg">
          <ShieldCheck className="mx-auto mb-4 size-10 text-muted-foreground/50" />
          <p className="text-sm">Lien invalide ou expiré.</p>
          <p className="mt-2 text-sm text-muted-foreground">Demandez un nouveau lien.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-[420px] rounded-lg border border-border bg-card p-8 shadow-socle-lg">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src={logo} alt="Edilumen" className="h-8" />
          <p className="text-sm text-muted-foreground">{copy.intro}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Mot de passe" htmlFor="password" hint="Minimum 8 caractères">
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirmer le mot de passe" htmlFor="confirm-password">
            <Input
              id="confirm-password"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </Field>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={loading} className="mt-2">
            {loading ? "Enregistrement…" : copy.cta}
          </Button>
        </form>
      </div>
    </div>
  );
}
