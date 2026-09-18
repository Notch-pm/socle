// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { UserCommunicationStep } from "./UserCommunicationStep";
import type { Procedure } from "@/features/procedures/useProcedures";

/** Démarche minimale mais complète pour piloter le composant. */
function makeProcedure(over: Partial<Procedure> = {}): Procedure {
  return {
    id: "proc-1",
    name: "Démarche test",
    organization_id: "org-1",
    category_id: null,
    type: "externe",
    keywords: null,
    short_description: null,
    input_duration_minutes: null,
    order_index: null,
    is_active_global: null,
    agent_description: null,
    user_description: null,
    user_communication: null,
    translations: null,
    requester_config: null,
    form_schema: null,
    knowledge_base: null,
    communication_config: null,
    status: "brouillon",
    access_mode: "libre",
    created_at: null,
    updated_at: null,
    ...over,
  };
}

function renderStep(procedure: Procedure) {
  const onSubmit = vi.fn();
  render(<UserCommunicationStep formId="usager-test" procedure={procedure} onSubmit={onSubmit} />);
  const form = () => document.getElementById("usager-test") as HTMLFormElement;
  return { onSubmit, submit: () => fireEvent.submit(form()) };
}

const description = () => screen.getByLabelText("Descriptif de la démarche") as HTMLTextAreaElement;
const duration = () =>
  screen.getByLabelText("Durée habituelle d'instruction") as HTMLInputElement;
const unit = () => screen.getByLabelText("Unité") as HTMLSelectElement;
const note = () =>
  screen.getByLabelText("Précision sur le public concerné") as HTMLTextAreaElement;

describe("UserCommunicationStep — état initial", () => {
  it("démarche jamais paramétrée : tout est vide, aucun délai inventé", () => {
    renderStep(makeProcedure());

    expect(description().value).toBe("");
    expect(duration().value).toBe("");
    // L'unité a bien une valeur par défaut, mais sans nombre elle n'annonce rien.
    expect(unit().value).toBe("jour");
    expect(note().value).toBe("");
    expect(screen.queryByLabelText("Intitulé de la pièce")).toBeNull();
    expect(screen.queryByLabelText("Question")).toBeNull();
  });

  it("relit le descriptif et les quatre blocs enregistrés", () => {
    renderStep(
      makeProcedure({
        user_description: "Ce que l'usager lit.",
        user_communication: {
          delays: { processingTimeValue: 3, processingTimeUnit: "semaine" },
          audience: { note: "Réservée aux résidents." },
          attachments: { items: [{ label: "CNI", description: "En cours de validité" }] },
          faq: { items: [{ question: "Où déposer ?", answer: "En ligne." }] },
        } as Procedure["user_communication"],
      }),
    );

    expect(description().value).toBe("Ce que l'usager lit.");
    expect(duration().value).toBe("3");
    expect(unit().value).toBe("semaine");
    expect(note().value).toBe("Réservée aux résidents.");
    expect((screen.getByLabelText("Intitulé de la pièce") as HTMLInputElement).value).toBe("CNI");
    expect((screen.getByLabelText("Question") as HTMLInputElement).value).toBe("Où déposer ?");
  });
});

describe("UserCommunicationStep — enregistrement", () => {
  it("⚠️ rend le descriptif SÉPARÉ de la config : ce sont deux colonnes", () => {
    const { onSubmit, submit } = renderStep(makeProcedure());

    fireEvent.change(description(), { target: { value: "Présentation." } });
    fireEvent.change(duration(), { target: { value: "10" } });
    fireEvent.change(unit(), { target: { value: "jour_ouvre" } });
    fireEvent.change(note(), { target: { value: "Habitants uniquement." } });
    submit();

    expect(onSubmit).toHaveBeenCalledWith({
      userDescription: "Présentation.",
      config: {
        delays: { processingTimeValue: 10, processingTimeUnit: "jour_ouvre" },
        audience: { note: "Habitants uniquement." },
        attachments: { items: [] },
        faq: { items: [] },
      },
    });
  });

  it("un descriptif vide part en `null`, pas en chaîne vide", () => {
    const { onSubmit, submit } = renderStep(makeProcedure({ user_description: "   " }));
    submit();
    expect(onSubmit.mock.calls[0][0].userDescription).toBeNull();
  });

  it("ajoute puis retire une pièce et une question", () => {
    const { onSubmit, submit } = renderStep(makeProcedure());

    fireEvent.click(screen.getByRole("button", { name: "Ajouter une pièce" }));
    fireEvent.change(screen.getByLabelText("Intitulé de la pièce"), {
      target: { value: "Justificatif de domicile" },
    });
    fireEvent.change(screen.getByLabelText("Précision sur la pièce"), {
      target: { value: "De moins de 3 mois" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Ajouter une question" }));
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Combien de temps ?" } });
    fireEvent.change(screen.getByLabelText("Réponse"), { target: { value: "Trois semaines." } });
    submit();

    expect(onSubmit.mock.calls[0][0].config.attachments.items).toEqual([
      { label: "Justificatif de domicile", description: "De moins de 3 mois" },
    ]);
    expect(onSubmit.mock.calls[0][0].config.faq.items).toEqual([
      { question: "Combien de temps ?", answer: "Trois semaines." },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Retirer cette pièce" }));
    fireEvent.click(screen.getByRole("button", { name: "Retirer cette question" }));
    submit();

    expect(onSubmit.mock.calls[1][0].config.attachments.items).toEqual([]);
    expect(onSubmit.mock.calls[1][0].config.faq.items).toEqual([]);
  });
});

describe("UserCommunicationStep — ce qui ne part pas sur un site public", () => {
  it("⚠️ une question sans réponse bloque l'enregistrement et s'explique", () => {
    const { onSubmit, submit } = renderStep(makeProcedure());

    fireEvent.click(screen.getByRole("button", { name: "Ajouter une question" }));
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Et si je déménage ?" } });
    submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Chaque question doit avoir une réponse/)).toBeTruthy();
  });

  it("une pièce sans intitulé bloque l'enregistrement", () => {
    const { onSubmit, submit } = renderStep(makeProcedure());

    fireEvent.click(screen.getByRole("button", { name: "Ajouter une pièce" }));
    fireEvent.change(screen.getByLabelText("Précision sur la pièce"), {
      target: { value: "Précision orpheline" },
    });
    submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/doit avoir un intitulé/)).toBeTruthy();
  });

  it("un délai à 0 bloque l'enregistrement — « 0 jour » promettrait une réponse immédiate", () => {
    const { onSubmit, submit } = renderStep(makeProcedure());

    fireEvent.change(duration(), { target: { value: "0" } });
    submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/nombre entier d'au moins 1/)).toBeTruthy();
  });
});

describe("UserCommunicationStep — les deux rappels sont en LECTURE SEULE", () => {
  it("⚠️ les publics viennent de `requester_config` et ne se règlent pas ici", () => {
    renderStep(
      makeProcedure({
        requester_config: {
          citoyen: { enabled: true, fields: {} },
          entreprise: { enabled: false, fields: {} },
          association: { enabled: true, fields: {} },
        } as Procedure["requester_config"],
      }),
    );

    const recap = screen.getByText("Publics autorisés à effectuer cette démarche").parentElement!;
    expect(within(recap).getByText("Citoyens")).toBeTruthy();
    expect(within(recap).getByText("Associations")).toBeTruthy();
    expect(within(recap).queryByText("Entreprises")).toBeNull();
    // Aucun contrôle de saisie : c'est ce qui le distingue d'un bloc de l'étape.
    expect(recap.querySelectorAll("input, select, textarea, [role='switch']")).toHaveLength(0);
    // Le renvoi vers l'écran qui fait foi (le même nom apparaît aussi dans l'aide
    // du champ de note, plus bas : on reste dans l'encadré).
    expect(within(recap).getByText(/Informations demandeur/)).toBeTruthy();
  });

  it("aucun public activé : l'écran le dit au lieu d'afficher une liste vide", () => {
    renderStep(makeProcedure());
    expect(screen.getByText(/Aucun public activé/)).toBeTruthy();
  });

  it("⚠️ les pièces du FORMULAIRE sont rappelées, jamais recopiées dans la liste annoncée", () => {
    renderStep(
      makeProcedure({
        form_schema: {
          version: 1,
          content: [
            {
              id: "a0",
              key: "pj0",
              type: "attachment",
              label: "Acte de naissance",
              acceptedFormats: ["pdf"],
              maxFiles: 1,
              required: true,
            },
          ],
        } as Procedure["form_schema"],
      }),
    );

    const recap = screen.getByText("Pièces téléversées dans le formulaire").parentElement!;
    expect(within(recap).getByText("Acte de naissance")).toBeTruthy();
    expect(within(recap).getByText("obligatoire")).toBeTruthy();
    expect(recap.querySelectorAll("input, select, textarea")).toHaveLength(0);
    // La liste éditoriale, elle, reste vide : rien n'a été recopié.
    expect(screen.queryByLabelText("Intitulé de la pièce")).toBeNull();
  });

  it("formulaire sans pièce : l'écran le dit", () => {
    renderStep(makeProcedure());
    expect(screen.getByText(/Le formulaire ne demande aucune pièce/)).toBeTruthy();
  });
});
