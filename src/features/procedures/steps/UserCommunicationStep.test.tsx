// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { UserCommunicationStep } from "./UserCommunicationStep";
import type { Procedure } from "@/features/procedures/useProcedures";
import type {
  TranslateLabelsInput,
  TranslateLabelsResult,
} from "@/features/languages/useTranslateLabels";

// Hooks Supabase/TanStack Query court-circuités (même motif que les autres
// tests d'étapes). Par défaut la collectivité est MONOLINGUE : les blocs de
// traduction ne s'affichent pas, et l'étape se teste comme avant. Les tests de
// traduction activent d'autres langues.
const h = vi.hoisted(() => ({
  languages: ["fr"] as string[],
  // Les appels à la traduction automatique restent EN VOL jusqu'à ce que le
  // test les résolve : c'est ce qui permet de retirer une ligne pendant l'appel.
  calls: [] as {
    input: TranslateLabelsInput;
    opts?: { onSuccess?: (answer: TranslateLabelsResult) => void };
  }[],
}));

vi.mock("@/features/languages/useOrganizationLanguages", () => ({
  useOrganizationLanguages: () => ({ data: h.languages }),
}));
vi.mock("@/features/languages/useTranslateLabels", () => ({
  useTranslateLabels: () => ({
    mutate: (
      input: TranslateLabelsInput,
      opts?: { onSuccess?: (answer: TranslateLabelsResult) => void },
    ) => h.calls.push({ input, opts }),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

beforeEach(() => {
  h.languages = ["fr"];
  h.calls = [];
});

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
    integration_id: null,
    external_reference: null,
    partner_config: null,
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
        audience: { note: "Habitants uniquement.", translations: {} },
        attachments: { items: [] },
        faq: { items: [] },
      },
      translations: {},
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

    // La clé de ligne de l'écran ne part pas avec : seul le contrat s'enregistre.
    expect(onSubmit.mock.calls[0][0].config.attachments.items).toEqual([
      { label: "Justificatif de domicile", description: "De moins de 3 mois", translations: {} },
    ]);
    expect(onSubmit.mock.calls[0][0].config.faq.items).toEqual([
      { question: "Combien de temps ?", answer: "Trois semaines.", translations: {} },
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

/** Les cases françaises d'une question — les cases traduites portent un `lang`. */
const questions = () =>
  screen.getAllByLabelText("Question").filter((el) => !el.hasAttribute("lang")) as HTMLInputElement[];

/** La ligne d'une question : ses cases françaises, et ses traductions dessous. */
const faqRow = (index: number) => questions()[index].parentElement as HTMLElement;

describe("UserCommunicationStep — traductions", () => {
  it("collectivité monolingue : aucun bloc de traduction", () => {
    renderStep(
      makeProcedure({
        user_communication: {
          faq: { items: [{ question: "Q", answer: "R" }] },
        } as Procedure["user_communication"],
      }),
    );
    expect(screen.queryByText("Traductions")).toBeNull();
  });

  it("un bloc sous chaque texte : descriptif, note, chaque pièce, chaque question", () => {
    h.languages = ["fr", "en"];
    renderStep(
      makeProcedure({
        user_communication: {
          attachments: { items: [{ label: "CNI", description: "" }] },
          faq: {
            items: [
              { question: "Q1", answer: "R1" },
              { question: "Q2", answer: "R2" },
            ],
          },
        } as Procedure["user_communication"],
      }),
    );
    // Rien sous les délais : la durée est structurée, le portail la rend dans sa langue.
    expect(screen.getAllByText("Traductions", { selector: "summary" })).toHaveLength(5);
  });

  it("⚠️ le descriptif va dans `translations`, sans toucher au libellé ni aux langues désactivées", () => {
    h.languages = ["fr", "en"];
    const { onSubmit, submit } = renderStep(
      makeProcedure({
        user_description: "Pour obtenir une copie.",
        // L'occitan n'est plus activé : sa traduction doit survivre.
        translations: {
          en: { name: "Birth certificate", short_description: "Get a copy." },
          oc: { user_description: "Per obténer una còpia." },
        } as Procedure["translations"],
      }),
    );

    fireEvent.change(document.getElementById("usager-description-translation-en")!, {
      target: { value: "To get a copy." },
    });
    submit();

    expect(onSubmit.mock.calls[0][0].translations).toEqual({
      en: {
        name: "Birth certificate",
        short_description: "Get a copy.",
        user_description: "To get a copy.",
      },
      oc: { user_description: "Per obténer una còpia." },
    });
  });

  it("relit et ouvre d'emblée une traduction déjà faite", () => {
    h.languages = ["fr", "en"];
    renderStep(
      makeProcedure({
        user_communication: {
          audience: { note: "Résidents.", translations: { en: { note: "Residents." } } },
        } as Procedure["user_communication"],
      }),
    );
    const cell = document.getElementById("usager-note-translation-en") as HTMLTextAreaElement;
    expect(cell.value).toBe("Residents.");
    expect(cell.closest("details")!.open).toBe(true);
    // Le français en filigrane : c'est ce que lira le visiteur si la case reste vide.
    expect(cell.placeholder).toBe("Résidents.");
  });

  it("la traduction de la note, d'une pièce et d'une question voyage avec son entrée", () => {
    h.languages = ["fr", "en"];
    const { onSubmit, submit } = renderStep(
      makeProcedure({
        user_communication: {
          audience: { note: "Résidents." },
          attachments: { items: [{ label: "CNI", description: "En cours de validité" }] },
          faq: { items: [{ question: "Où ?", answer: "En ligne." }] },
        } as Procedure["user_communication"],
      }),
    );

    fireEvent.change(document.getElementById("usager-note-translation-en")!, {
      target: { value: "Residents." },
    });
    const groups = screen.getAllByRole("group", { name: "Anglais" });
    // Deux groupes « Anglais » à deux champs : la pièce, puis la question.
    fireEvent.change(within(groups[0]).getByLabelText("Intitulé"), {
      target: { value: "ID card" },
    });
    fireEvent.change(within(groups[1]).getByLabelText("Réponse"), {
      target: { value: "Online." },
    });
    submit();

    const config = onSubmit.mock.calls[0][0].config;
    expect(config.audience.translations).toEqual({ en: { note: "Residents." } });
    expect(config.attachments.items[0].translations).toEqual({ en: { label: "ID card" } });
    expect(config.faq.items[0].translations).toEqual({ en: { answer: "Online." } });
    // Et rien n'est parti dans la colonne : ces textes vivent dans le JSON.
    expect(onSubmit.mock.calls[0][0].translations).toEqual({});
  });

  it("⚠️ une réponse de traduction retrouve SA question, même si l'on en retire une pendant l'appel", () => {
    h.languages = ["fr", "en"];
    const { onSubmit, submit } = renderStep(
      makeProcedure({
        user_communication: {
          faq: {
            items: [
              { question: "Q1", answer: "R1" },
              { question: "Q2", answer: "R2" },
              { question: "Q3", answer: "R3" },
            ],
          },
        } as Procedure["user_communication"],
      }),
    );

    // On traduit la DEUXIÈME question…
    fireEvent.click(
      within(faqRow(1)).getByRole("button", { name: "Traduire automatiquement", hidden: true }),
    );
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].input.kind).toBe("user_communication");
    expect(h.calls[0].input.fields).toEqual([
      { key: "question", value: "Q2" },
      { key: "answer", value: "R2" },
    ]);

    // … et l'on retire la première pendant que l'appel est en vol : la
    // deuxième devient la première, la troisième prend son index.
    fireEvent.click(screen.getAllByRole("button", { name: "Retirer cette question" })[0]);
    act(() => {
      h.calls[0].opts?.onSuccess?.({
        translations: { en: { question: "Q2 en", answer: "R2 en" } },
        missing: [],
      });
    });
    submit();

    expect(onSubmit.mock.calls[0][0].config.faq.items).toEqual([
      { question: "Q2", answer: "R2", translations: { en: { question: "Q2 en", answer: "R2 en" } } },
      // Repérée par son index, la réponse se serait posée ICI.
      { question: "Q3", answer: "R3", translations: {} },
    ]);
  });

  it("⚠️ une réponse dont la question a été retirée ne se pose nulle part", () => {
    h.languages = ["fr", "en"];
    const { onSubmit, submit } = renderStep(
      makeProcedure({
        user_communication: {
          faq: {
            items: [
              { question: "Q1", answer: "R1" },
              { question: "Q2", answer: "R2" },
            ],
          },
        } as Procedure["user_communication"],
      }),
    );

    fireEvent.click(
      within(faqRow(0)).getByRole("button", { name: "Traduire automatiquement", hidden: true }),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Retirer cette question" })[0]);
    act(() => {
      h.calls[0].opts?.onSuccess?.({
        translations: { en: { question: "Q1 en", answer: "R1 en" } },
        missing: [],
      });
    });
    submit();

    expect(onSubmit.mock.calls[0][0].config.faq.items).toEqual([
      { question: "Q2", answer: "R2", translations: {} },
    ]);
  });

  it("le descriptif se traduit avec le registre d'une démarche, en Markdown conservé", () => {
    h.languages = ["fr", "en"];
    renderStep(makeProcedure({ user_description: "## Pour qui ?\n\n- Les **résidents**" }));

    const section = screen.getByRole("heading", { name: "Descriptif de la démarche" })
      .parentElement!.parentElement!;
    fireEvent.click(
      within(section).getByRole("button", { name: "Traduire automatiquement", hidden: true }),
    );
    expect(h.calls[0].input.kind).toBe("procedure");
    expect(h.calls[0].input.fields).toEqual([
      { key: "user_description", value: "## Pour qui ?\n\n- Les **résidents**" },
    ]);
  });
});
