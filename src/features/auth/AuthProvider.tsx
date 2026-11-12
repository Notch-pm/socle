import * as React from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { ssoLogoutRedirect } from "@/features/auth/sso";
import type { Tables } from "@/types/database.types";

type Profile = Tables<"users">;

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Keyé sur l'id utilisateur, PAS sur l'objet session : supabase-js ré-émet
  // SIGNED_IN / TOKEN_REFRESHED avec un nouvel objet session à chaque retour sur
  // l'onglet ; repasser `loading` à true ferait afficher l'écran de chargement
  // des routes protégées et démonterait toute la page (perte des états locaux :
  // étape du stepper, saisies en cours…).
  const userId = session?.user.id ?? null;

  React.useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);

    supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setProfile(data);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const signOut = React.useCallback(async () => {
    // Déconnexion unique : on ferme aussi la session Keycloak (voir sso.ts).
    const { data } = await supabase.auth.getSession();
    const keycloakLogout = ssoLogoutRedirect(data.session?.user, "socle", window.location.origin, "/login");
    await supabase.auth.signOut();
    if (keycloakLogout) window.location.assign(keycloakLogout);
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
