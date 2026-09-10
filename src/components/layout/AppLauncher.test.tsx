// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppLauncher } from "./AppLauncher";

function open() {
  fireEvent.click(screen.getByLabelText("Changer d'application"));
}

describe("AppLauncher", () => {
  it("n'ouvre la grille que sur demande", () => {
    render(<AppLauncher />);
    expect(screen.queryByRole("menu")).toBeNull();
    open();
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("mène chez chacune des autres applications, sur son sous-domaine", () => {
    render(<AppLauncher />);
    open();
    const links = screen.getAllByRole("menuitem");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://iris.edilumen.fr",
      "https://clara.edilumen.fr",
      "https://ariane.edilumen.fr",
    ]);
  });

  it("coche l'application courante au lieu d'en faire un lien", () => {
    // Un lien vers l'application où l'on se trouve rechargerait la page pour
    // aboutir là où l'on est déjà.
    render(<AppLauncher />);
    open();
    const links = screen.getAllByRole("menuitem");
    expect(links.some((a) => a.textContent?.includes("Socle"))).toBe(false);
    expect(screen.getByText("Socle").closest("[aria-current]")).toBeTruthy();
  });

  it("rappelle que la collectivité, elle, ne change pas", () => {
    render(<AppLauncher organizationName="ACCM" />);
    open();
    expect(screen.getByText("Vous restez sur l'organisation ACCM.")).toBeTruthy();
  });

  it("ne promet rien tant que la collectivité n'est pas connue", () => {
    render(<AppLauncher />);
    open();
    expect(screen.queryByText(/Vous restez sur l'organisation/)).toBeNull();
  });

  it("se referme à l'échappement", () => {
    render(<AppLauncher />);
    open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
