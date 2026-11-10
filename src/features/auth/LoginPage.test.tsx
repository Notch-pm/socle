// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "./LoginPage";

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
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
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
