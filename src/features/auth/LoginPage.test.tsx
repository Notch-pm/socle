// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "./LoginPage";
import { SILENT_SSO_AT_KEY, SILENT_SSO_KEY } from "./sso";

// La page de connexion offre deux portes : le compte de la collectivité (Keycloak,
// lot 4 de l'annuaire des agents) et le mot de passe du Socle.
const h = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { signInWithOAuth: h.signInWithOAuth, signInWithPassword: h.signInWithPassword } },
}));

vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ session: null, profile: null, loading: false, signOut: vi.fn() }),
}));

function renderAt(url: string) {
  window.history.replaceState(null, "", url);
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.signInWithOAuth.mockReset();
  h.signInWithPassword.mockReset();
  h.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
  // Par défaut, une tentative silencieuse vient d'avoir lieu dans cet onglet.
  window.sessionStorage.setItem(SILENT_SSO_KEY, "done");
  window.sessionStorage.setItem(SILENT_SSO_AT_KEY, String(Date.now()));
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
  window.sessionStorage.clear();
});

describe("LoginPage — connexion avec le compte de la collectivité", () => {
  it("le bouton part vers Keycloak avec le scope openid et revient sur /login", async () => {
    renderAt("/login");
    fireEvent.click(screen.getByRole("button", { name: /compte de ma collectivité/ }));
    await waitFor(() => expect(h.signInWithOAuth).toHaveBeenCalledTimes(1));
    expect(h.signInWithOAuth).toHaveBeenCalledWith({
      provider: "keycloak",
      options: { scopes: "openid", redirectTo: `${window.location.origin}/login` },
    });
    expect(h.signInWithPassword).not.toHaveBeenCalled();
  });

  it("au retour d'un agent non provisionné : message clair, et l'URL est nettoyée", () => {
    renderAt(
      "/login?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance",
    );
    expect(screen.getByRole("alert").textContent).toMatch(/n'a pas accès au Socle/);
    expect(window.location.search).toBe("");
  });

  it("si le départ vers Keycloak échoue, on le dit et on propose le mot de passe", async () => {
    h.signInWithOAuth.mockResolvedValue({ data: {}, error: { message: "provider is not enabled" } });
    renderAt("/login");
    fireEvent.click(screen.getByRole("button", { name: /compte de ma collectivité/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/mot de passe/);
    expect((screen.getByRole("button", { name: /compte de ma collectivité/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("le mot de passe est replié derrière « Autre méthode de connexion »", () => {
    renderAt("/login");
    expect(screen.queryByLabelText("Mot de passe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Autre méthode de connexion" }));
    expect(screen.getByLabelText("Mot de passe")).toBeTruthy();
  });

  it("le mot de passe reste possible, sans passer par Keycloak", async () => {
    h.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    renderAt("/login");
    fireEvent.click(screen.getByRole("button", { name: "Autre méthode de connexion" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "agent@accm.fr" } });
    fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    await waitFor(() =>
      expect(h.signInWithPassword).toHaveBeenCalledWith({ email: "agent@accm.fr", password: "secret" }),
    );
    expect(h.signInWithOAuth).not.toHaveBeenCalled();
  });
});

describe("LoginPage — connexion silencieuse (session Keycloak d'une autre application)", () => {
  it("première arrivée de l'onglet : demande à Keycloak sans écran (prompt=none), une seule fois", async () => {
    window.sessionStorage.clear();
    renderAt("/login");
    expect(screen.getByText("Connexion…")).toBeTruthy();
    await waitFor(() => expect(h.signInWithOAuth).toHaveBeenCalledTimes(1));
    expect(h.signInWithOAuth).toHaveBeenCalledWith({
      provider: "keycloak",
      options: {
        scopes: "openid",
        redirectTo: `${window.location.origin}/login`,
        queryParams: { prompt: "none" },
      },
    });
    expect(window.sessionStorage.getItem(SILENT_SSO_KEY)).toBe("pending");
  });

  it("retour sans session Keycloak : la page s'affiche, sans message d'erreur", () => {
    window.sessionStorage.setItem(SILENT_SSO_KEY, "pending");
    renderAt("/login#error=login_required&error_description=Login+required");
    expect(screen.getByRole("button", { name: /compte de ma collectivité/ })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(h.signInWithOAuth).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(SILENT_SSO_KEY)).toBe("done");
    // L'erreur est effacée de l'URL : un F5 pourra retenter.
    expect(window.location.hash).toBe("");
  });

  it("F5 sur la page, la dernière tentative est ancienne : on retente", async () => {
    window.sessionStorage.setItem(SILENT_SSO_AT_KEY, "0");
    renderAt("/login");
    await waitFor(() => expect(h.signInWithOAuth).toHaveBeenCalledTimes(1));
  });

  it("retour sur l'onglet : on retente, sauf formulaire de mot de passe ouvert", async () => {
    renderAt("/login");
    window.sessionStorage.setItem(SILENT_SSO_AT_KEY, "0");
    fireEvent.click(screen.getByRole("button", { name: "Autre méthode de connexion" }));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(h.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("retour sur l'onglet, formulaire fermé, délai passé : on retente", async () => {
    renderAt("/login");
    window.sessionStorage.setItem(SILENT_SSO_AT_KEY, "0");
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(h.signInWithOAuth).toHaveBeenCalledTimes(1));
  });

  it("retour silencieux d'un agent non provisionné : le message reste affiché", () => {
    window.sessionStorage.setItem(SILENT_SSO_KEY, "pending");
    renderAt("/login?error=access_denied&error_code=signup_disabled");
    expect(screen.getByRole("alert").textContent).toMatch(/n'a pas accès au Socle/);
  });

  it("si la tentative ne peut partir, la page s'affiche normalement", async () => {
    window.sessionStorage.clear();
    h.signInWithOAuth.mockResolvedValue({ data: {}, error: { message: "provider is not enabled" } });
    renderAt("/login");
    expect(await screen.findByRole("button", { name: /compte de ma collectivité/ })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
