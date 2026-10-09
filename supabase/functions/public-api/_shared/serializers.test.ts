import { describe, expect, it } from "vitest";
import {
  serializeCategory,
  serializeDocumentTemplate,
  serializeDocumentType,
  serializeOrganization,
  serializeOrganizationProcedure,
  serializePortalProcedure,
  serializePortalProcedureDetail,
  serializeProcedure,
  serializeProcedureDocuments,
  readAccessMode,
  serializeQuartier,
  serializeBranding,
  serializeSmtpSettings,
  readPortalAssistant,
  readPortalFreeMail,
  serializeTenant,
} from "./serializers.ts";
import { defaultPortalThemeDto } from "./portalTheme.ts";

describe("serializers — whitelist stricte (aucune fuite)", () => {
  it("n'expose que les champs prévus pour une organisation, même avec des colonnes en trop", () => {
    const row = {
      id: "org-1",
      parent_id: null,
      name: "ACCM",
      slug: "accm",
      type: "collectivité",
      status: "active",
      address: null,
      phone: null,
      email: null,
      logo_url: null,
      is_internal_service: true,
      email_sender_override: false,
      email_sender_name: null,
      metadata: null,
      created_at: "2026-01-01T00:00:00Z",
      // Colonnes sensibles/parasites qui ne doivent JAMAIS ressortir :
      secret_column: "leak",
      password: "hunter2",
    };
    const dto = serializeOrganization(row);
    expect(Object.keys(dto).sort()).toEqual(
      [
        "address",
        "created_at",
        "email",
        "email_sender_name",
        "email_sender_override",
        "id",
        "is_internal_service",
        "logo_url",
        "metadata",
        "name",
        "parent_id",
        "phone",
        "slug",
        "status",
        "type",
      ].sort(),
    );
    expect(dto).not.toHaveProperty("secret_column");
    expect(dto).not.toHaveProperty("password");
  });

  it("catégorie : libellé, icône et libellés traduits", () => {
    const dto = serializeCategory({
      id: "c1",
      organization_id: "org-1",
      name: "État civil",
      icon: "FileText",
      translations: { en: { name: "Civil status" } },
      created_at: null,
      internal: "x",
    });
    expect(dto).toEqual({
      id: "c1",
      organization_id: "org-1",
      name: "État civil",
      icon: "FileText",
      // Schéma possédé, transmis tel quel.
      translations: { en: { name: "Civil status" } },
      created_at: null,
    });
  });

  it("catégorie : une colonne de traductions absente ne casse rien", () => {
    expect(serializeCategory({ id: "c1", name: "État civil" }).translations).toBeNull();
  });

  it("démarche : transmet les blocs JSON possédés et normalise keywords", () => {
    const form = { version: 1, content: [] };
    const dto = serializeProcedure({
      id: "p1",
      organization_id: "org-1",
      category_id: "c1",
      name: "Demande X",
      type: "externe",
      keywords: null, // → tableau vide
      short_description: null,
      user_description: null,
      agent_description: null,
      input_duration_minutes: 10,
      order_index: 0,
      requester_config: { citoyen: { enabled: true, fields: {} } },
      form_schema: form,
      knowledge_base: null,
      communication_config: { visibility: { portalVisible: false } },
      translations: null,
      created_at: null,
      updated_at: null,
      is_active_global: true, // colonne non exposée
    }, new Map());
    expect(dto.keywords).toEqual([]);
    expect(dto.form_schema).toBe(form);
    expect(dto).not.toHaveProperty("is_active_global");
    // JSON possédé : transmis tel quel, jamais réinterprété.
    expect(dto.communication_config).toEqual({ visibility: { portalVisible: false } });
  });

  it("démarche jamais paramétrée : communication_config vaut null, pas undefined", () => {
    const dto = serializeProcedure({ id: "p2", name: "Sans communication", type: "externe" }, new Map());
    expect(dto.communication_config).toBeNull();
    expect(Object.keys(dto)).toContain("communication_config");
  });

  it("partner : null pour une démarche du Socle, renseigné pour une démarche partenaire", () => {
    expect(serializeProcedure({ id: "p1", name: "Socle" }, new Map()).partner).toBeNull();
    const config = { CodeQualificationMetier: "M1", FormComponents: [{ id: "lieu" }] };
    const dto = serializeProcedure(
      { id: "p2", name: "Voirie", integration_id: "i-arpege", external_reference: "VOIRIE", partner_config: config },
      new Map(),
      new Map([["i-arpege", "arpege"]]),
    );
    expect(dto.partner).toEqual({ integration: "arpege", reference: "VOIRIE", config });
    // Intégration inconnue : la démarche reste marquée partenaire, jamais prise pour une démarche du Socle.
    const unknown = serializeProcedure({ id: "p3", name: "X", integration_id: "i-x", external_reference: "X" }, new Map());
    expect(unknown.partner).toEqual({ integration: null, reference: "X", config: null });
  });

  it("statut : seule « production » l'est ; le doute ne publie rien", () => {
    expect(serializeProcedure({ status: "production" }, new Map()).status).toBe("production");
    expect(serializeProcedure({ status: "brouillon" }, new Map()).status).toBe("brouillon");
    // Colonne absente, nulle ou inattendue → brouillon.
    for (const status of [undefined, null, "", "PRODUCTION", 1, true]) {
      expect(serializeProcedure({ status }, new Map()).status).toBe("brouillon");
    }
  });

  describe("accès : libre ou réservé aux usagers authentifiés", () => {
    it("sert les deux accès réglés par la collectivité", () => {
      expect(serializeProcedure({ access_mode: "libre" }, new Map()).access_mode).toBe("libre");
      expect(serializeProcedure({ access_mode: "authentifie" }, new Map()).access_mode).toBe(
        "authentifie",
      );
    });

    it("⚠️ le doute ne FERME rien : toute autre valeur vaut « libre »", () => {
      // L'inverse du doute sur `status`, et pour la même raison — on n'affirme
      // rien que la collectivité n'ait réglé. Annoncer une restriction
      // imaginaire ferait refuser des dépôts qui passaient la veille.
      for (const access_mode of [undefined, null, "", "AUTHENTIFIE", "authentifié", 1, true]) {
        expect(
          serializeProcedure({ access_mode }, new Map()).access_mode,
          JSON.stringify(access_mode) ?? "undefined",
        ).toBe("libre");
      }
    });

    /**
     * ⚠️ Miroir volontaire de `parseProcedureAccessMode`
     * (`src/features/procedures/procedureAccess.ts`) : une edge function ne
     * peut rien importer de `src/`, et ce sont les tests des deux côtés qui
     * empêchent les deux lectures de diverger — motif `readAudiences`.
     */
    it("readAccessMode ne connaît que deux réponses", () => {
      expect(readAccessMode("authentifie")).toBe("authentifie");
      expect(readAccessMode("libre")).toBe("libre");
      expect(readAccessMode(undefined)).toBe("libre");
    });
  });

  it("activation : is_enabled coercé en booléen", () => {
    const dto = serializeOrganizationProcedure({
      organization_id: "org-2",
      procedure_id: "p1",
      is_enabled: null,
      custom_name: null,
      custom_order: null,
      metadata: null,
    });
    expect(dto.is_enabled).toBe(false);
  });

  it("quartier : n'expose jamais la colonne geom (binaire PostGIS)", () => {
    const row = {
      id: "q1",
      organization_id: "org-1",
      name: "Centre-ville",
      color: "hsl(152 83% 42%)",
      geom: "0106000020E61000...", // binaire — ne doit JAMAIS ressortir
      created_by: "user-1", // interne — non exposé
      created_at: "2026-07-17T09:00:00Z",
      updated_at: "2026-07-17T09:00:00Z",
    };
    const dto = serializeQuartier(row);
    expect(dto).toEqual({
      id: "q1",
      organization_id: "org-1",
      name: "Centre-ville",
      color: "hsl(152 83% 42%)",
      created_at: "2026-07-17T09:00:00Z",
      updated_at: "2026-07-17T09:00:00Z",
    });
    expect(dto).not.toHaveProperty("geom");
    expect(dto).not.toHaveProperty("created_by");
    expect(dto).not.toHaveProperty("geometry");
  });

  it("quartier : inclut la géométrie GeoJSON quand elle est fournie (y compris null)", () => {
    const geojson = { type: "MultiPolygon", coordinates: [] };
    const withGeometry = serializeQuartier({ id: "q1", organization_id: "o", name: "N" }, geojson);
    expect(withGeometry.geometry).toBe(geojson);
    const withNull = serializeQuartier({ id: "q1", organization_id: "o", name: "N" }, null);
    expect(withNull).toHaveProperty("geometry", null);
  });

  it("type de pièce : champs simples", () => {
    const dto = serializeDocumentType({
      id: "dt1",
      organization_id: "org-1",
      name: "Justificatif",
      created_at: null,
    });
    expect(dto).toEqual({
      id: "dt1",
      organization_id: "org-1",
      name: "Justificatif",
      created_at: null,
    });
  });
});

describe("serializeSmtpSettings — la seule sortie sensible, bornée au strict nécessaire", () => {
  const row = {
    id: "smtp-1",
    organization_id: "org-1",
    host: " smtp.accm.fr ",
    port: 465,
    username: "iris@accm.fr",
    password: "  secret avec espaces  ",
    from_email: "Ne-Pas-Repondre@ACCM.fr",
    from_name: "ACCM",
    use_tls: true,
    created_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    // Colonnes parasites : elles ne doivent pas ressortir.
    imap_password: "fuite",
  };

  it("n'expose que les champs du contrat", () => {
    expect(Object.keys(serializeSmtpSettings("org-1", row)).sort()).toEqual([
      "configured",
      "from_email",
      "from_name",
      "host",
      "organization_id",
      "password",
      "port",
      "source_organization_id",
      "updated_at",
      "use_tls",
      "username",
    ]);
  });

  it("normalise : hôte élagué, adresse en minuscules, mot de passe intact", () => {
    const dto = serializeSmtpSettings("org-1", row);
    expect(dto.configured).toBe(true);
    expect(dto.host).toBe("smtp.accm.fr");
    expect(dto.from_email).toBe("ne-pas-repondre@accm.fr");
    // Une espace peut faire partie d'un mot de passe : jamais d'élagage ici.
    expect(dto.password).toBe("  secret avec espaces  ");
    expect(dto.port).toBe(465);
  });

  it("ligne absente ⇒ configured:false et tous les champs nuls", () => {
    const dto = serializeSmtpSettings("org-1", null);
    expect(dto).toEqual({
      organization_id: "org-1",
      source_organization_id: null,
      configured: false,
      host: null,
      port: null,
      username: null,
      password: null,
      from_email: null,
      from_name: null,
      use_tls: null,
      updated_at: null,
    });
  });

  it("configuration incomplète (colonnes '' par défaut) ⇒ traitée comme absente", () => {
    expect(serializeSmtpSettings("org-1", { ...row, host: "   " }).configured).toBe(false);
    expect(serializeSmtpSettings("org-1", { ...row, from_email: "" }).configured).toBe(false);
  });

  it("valeurs par défaut prudentes : port 587, TLS actif sauf refus explicite", () => {
    expect(serializeSmtpSettings("org-1", { ...row, port: null }).port).toBe(587);
    expect(serializeSmtpSettings("org-1", { ...row, port: 70000 }).port).toBe(587);
    expect(serializeSmtpSettings("org-1", { ...row, use_tls: null }).use_tls).toBe(true);
    expect(serializeSmtpSettings("org-1", { ...row, use_tls: false }).use_tls).toBe(false);
  });

  it("mot de passe vide ⇒ null (relais sans authentification), pas une chaîne vide", () => {
    expect(serializeSmtpSettings("org-1", { ...row, password: "" }).password).toBeNull();
    expect(serializeSmtpSettings("org-1", { ...row, username: "  " }).username).toBeNull();
  });

  it("héritage : la source est la ligne résolue, l'organisation demandée reste celle du chemin", () => {
    // Sous-organisation qui hérite : la ligne vient de sa principale.
    const dto = serializeSmtpSettings("sous-org-9", row);
    expect(dto.organization_id).toBe("sous-org-9");
    expect(dto.source_organization_id).toBe("org-1");
    // Relais propre : les deux coïncident.
    expect(serializeSmtpSettings("org-1", row).source_organization_id).toBe("org-1");
    // Ligne sans colonne organization_id : on retombe sur l'organisation demandée.
    const orphan = { ...row } as Record<string, unknown>;
    delete orphan.organization_id;
    expect(serializeSmtpSettings("org-1", orphan).source_organization_id).toBe("org-1");
  });
});

describe("serializeBranding — la charte applicable, héritage déjà résolu", () => {
  const row = {
    source_organization_id: "org-racine",
    logo_url: "  https://accm.fr/logo.png  ",
    logo_white_url: "https://accm.fr/blanc.svg",
    favicon_url: "https://accm.fr/favicon.png",
    primary_color: "#1F8A5B",
    secondary_color: "#FFD166",
    // Colonnes parasites : la whitelist ne doit pas les laisser passer.
    password: "hunter2",
    key_hash: "deadbeef",
  };

  it("n'expose que les neuf champs du contrat", () => {
    expect(Object.keys(serializeBranding("org-enfant", row)).sort()).toEqual([
      "configured",
      "favicon_url",
      "inherited",
      "logo_url",
      "logo_white_url",
      "organization_id",
      "primary_color",
      "secondary_color",
      "source_organization_id",
    ]);
  });

  it("normalise les couleurs en minuscules et rogne les URL", () => {
    const dto = serializeBranding("org-enfant", row);
    expect(dto.primary_color).toBe("#1f8a5b");
    expect(dto.secondary_color).toBe("#ffd166");
    expect(dto.logo_url).toBe("https://accm.fr/logo.png");
  });

  it("dit que la charte est héritée quand la source n'est pas l'organisation demandée", () => {
    expect(serializeBranding("org-enfant", row).inherited).toBe(true);
    expect(serializeBranding("org-racine", row).inherited).toBe(false);
  });

  it("aucune charte nulle part ⇒ 200 vide et configured:false, jamais une erreur", () => {
    const dto = serializeBranding("org-enfant", null);
    expect(dto).toEqual({
      organization_id: "org-enfant",
      source_organization_id: null,
      inherited: false,
      configured: false,
      logo_url: null,
      logo_white_url: null,
      favicon_url: null,
      primary_color: null,
      secondary_color: null,
    });
  });

  it("un favicon seul suffit à « configurer » : le drapeau compte les CINQ éléments", () => {
    const dto = serializeBranding("org-racine", {
      source_organization_id: "org-racine",
      logo_url: null,
      logo_white_url: null,
      favicon_url: "https://accm.fr/favicon.png",
      primary_color: null,
      secondary_color: null,
    });
    expect(dto.configured).toBe(true);
    expect(dto.favicon_url).toBe("https://accm.fr/favicon.png");
  });

  it("une source sans aucun élément n'est pas « configurée »", () => {
    const dto = serializeBranding("org-enfant", {
      source_organization_id: "org-racine",
      logo_url: null,
      logo_white_url: "   ",
      favicon_url: null,
      primary_color: null,
      secondary_color: null,
    });
    expect(dto.configured).toBe(false);
    // …mais on sait toujours qui aurait dû la porter.
    expect(dto.source_organization_id).toBe("org-racine");
  });

  it("un seul élément suffit à rendre la charte exploitable", () => {
    expect(
      serializeBranding("org-1", {
        source_organization_id: "org-1",
        logo_url: null,
        logo_white_url: null,
        primary_color: "#000000",
        secondary_color: null,
      }).configured,
    ).toBe(true);
  });

  it("refuse ce qui n'est pas une couleur hexadécimale plutôt que de le transmettre", () => {
    const dto = serializeBranding("org-1", {
      source_organization_id: "org-1",
      logo_url: null,
      logo_white_url: null,
      primary_color: "vert",
      secondary_color: "#12345",
    });
    expect(dto.primary_color).toBeNull();
    expect(dto.secondary_color).toBeNull();
    expect(dto.configured).toBe(false);
  });
});

describe("serializeDocumentTemplate", () => {
  it("expose le catalogue sans jamais servir le chemin de stockage", () => {
    const dto = serializeDocumentTemplate({
      id: "t1",
      organization_id: "org-1",
      name: "Accusé de réception",
      description: null,
      type: "courrier",
      file_name: "ar.docx",
      file_path: "org-1/uid-ar.docx",
      created_at: null,
      updated_at: null,
    });
    expect(dto.name).toBe("Accusé de réception");
    expect(dto.file_name).toBe("ar.docx");
    // Le chemin est un détail interne : le fichier s'obtient par /signed-url.
    expect(Object.keys(dto)).not.toContain("file_path");
  });
});

describe("serializeProcedureDocuments", () => {
  const templates = new Map<string, Record<string, unknown>>([
    ["d1", { id: "d1", name: "Notice", description: "Aide", type: "interne", file_name: "n.docx" }],
    ["c1", { id: "c1", name: "Refus", description: null, type: "courrier", file_name: "r.docx" }],
  ]);

  it("vaut le bloc vide pour une démarche jamais paramétrée", () => {
    for (const raw of [null, undefined, 42, {}, { visibility: {} }]) {
      expect(serializeProcedureDocuments(raw, templates)).toEqual({
        restrict_visibility: false,
        items: [],
      });
    }
  });

  it("résout documents puis courriers, en marquant leur groupe", () => {
    const dto = serializeProcedureDocuments(
      {
        documents: {
          restrictVisibility: true,
          documents: [{ id: "d1", visibility: "positive" }],
          letters: [{ id: "c1", visibility: "negative" }],
        },
      },
      templates,
    );
    expect(dto.restrict_visibility).toBe(true);
    expect(dto.items.map((i) => [i.id, i.group, i.visibility])).toEqual([
      ["d1", "document", "positive"],
      ["c1", "courrier", "negative"],
    ]);
    expect(dto.items[0].name).toBe("Notice");
    expect(dto.items[0].file_name).toBe("n.docx");
  });

  it("écarte une référence dont le document a quitté le catalogue", () => {
    // Pas de clé étrangère dans le JSON : une sélection survit à son document.
    // Servir un id mort obligerait le consommateur à gérer un 404 sur signed-url.
    const dto = serializeProcedureDocuments(
      { documents: { documents: [{ id: "disparu" }, { id: "d1" }] } },
      templates,
    );
    expect(dto.items.map((i) => i.id)).toEqual(["d1"]);
  });

  it("ramène une condition inconnue à « toujours », sans masquer le document", () => {
    const dto = serializeProcedureDocuments(
      { documents: { documents: [{ id: "d1", visibility: "un-jour" }] } },
      templates,
    );
    expect(dto.items[0].visibility).toBe("toujours");
  });

  it("dédoublonne et ignore les entrées sans identifiant", () => {
    const dto = serializeProcedureDocuments(
      { documents: { documents: [{ id: "d1" }, null, { id: "  " }, { id: "d1" }] } },
      templates,
    );
    expect(dto.items.map((i) => i.id)).toEqual(["d1"]);
  });

  it("restrict_visibility faux par défaut : les conditions ne s'appliquent pas", () => {
    // Le consommateur qui applique les conditions sans lire ce drapeau masquerait
    // à tort des documents que le paramétreur a rendus visibles.
    const dto = serializeProcedureDocuments(
      { documents: { letters: [{ id: "c1", visibility: "negative" }] } },
      templates,
    );
    expect(dto.restrict_visibility).toBe(false);
    expect(dto.items[0].visibility).toBe("negative");
  });
});

describe("serializeTenant — la whitelist la plus étroite (page publique)", () => {
  const row = {
    id: "org-1",
    name: "Ville de Nantes",
    slug: "nantes",
    // Colonnes que `select *` ramènerait, et qu'aucun visiteur du portail n'a
    // à lire. C'est tout l'intérêt du sérialiseur dédié : le jour où la route
    // passera à `select *`, rien de ceci ne franchira.
    address: "2 rue de l'Hôtel de Ville",
    phone: "0240000000",
    email: "contact@nantes.fr",
    metadata: { siret: "12345678900011" },
    email_sender_name: "Ville de Nantes",
    status: "active",
    parent_id: null,
  };

  it("n'expose que id, name, slug, le domaine résolu, les langues, le thème et l'assistant", () => {
    const dto = serializeTenant(row, "nantes.edilumen.fr", ["fr", "br"], null);
    expect(Object.keys(dto).sort()).toEqual([
      "assistant",
      "hostname",
      "id",
      "languages",
      "name",
      "slug",
      "theme",
    ]);
    expect(dto).toMatchObject({
      id: "org-1",
      name: "Ville de Nantes",
      slug: "nantes",
      hostname: "nantes.edilumen.fr",
      languages: ["fr", "br"],
    });
    // Aucune des colonnes de la ligne ne franchit.
    for (const leak of ["address", "phone", "email", "metadata", "email_sender_name", "status"]) {
      expect(dto).not.toHaveProperty(leak);
    }
  });

  it("⚠️ l'assistant est FERMÉ tant que rien ne l'ouvre — jamais null, jamais un trou", () => {
    // Rien de réglé, lecture en échec, forme inattendue : au doute, on ne
    // dépense pas le crédit IA d'une collectivité.
    const closed = { enabled: false, deposit_enabled: false, voice_enabled: false };
    expect(serializeTenant(row, "n.fr", null, null).assistant).toEqual(closed);
    for (const raw of [null, undefined, [], "oui", 1, { enabled: "true" }, [{ enabled: 1 }], { voice_enabled: true }]) {
      expect(readPortalAssistant(raw)).toEqual(closed);
    }
  });

  it("lit la ligne de `resolve_portal_assistant`, seule ou en tableau", () => {
    const open = { source_organization_id: "org-1", enabled: true, deposit_enabled: true, voice_enabled: true };
    const expected = { enabled: true, deposit_enabled: true, voice_enabled: true };
    expect(readPortalAssistant(open)).toEqual(expected);
    expect(readPortalAssistant([open])).toEqual(expected);
    expect(serializeTenant(row, "n.fr", null, null, false, [open]).assistant).toEqual(expected);
    // Trois booléens, et rien de la ligne : ni la source, ni qui a réglé.
    expect(Object.keys(readPortalAssistant({ ...open, updated_by: "user-1" })).sort()).toEqual([
      "deposit_enabled",
      "enabled",
      "voice_enabled",
    ]);
  });

  it("⚠️ le commutateur s'applique à la frontière : pas de dépôt sous un assistant fermé", () => {
    // La base CONSERVE `deposit_enabled` quand on coupe l'assistant (le réglage
    // gouverne l'usage, pas la donnée) ; c'est ici qu'il cesse de sortir.
    expect(readPortalAssistant({ enabled: false, deposit_enabled: true, voice_enabled: true })).toEqual({
      enabled: false,
      deposit_enabled: false,
      voice_enabled: false,
    });
    expect(readPortalAssistant({ enabled: true, deposit_enabled: false, voice_enabled: false })).toEqual({
      enabled: true,
      deposit_enabled: false,
      voice_enabled: false,
    });
    // La voix ne dépend que de l'assistant, pas du recueil : on peut parler
    // à un assistant qui ne fait que renseigner.
    expect(readPortalAssistant({ enabled: true, deposit_enabled: false, voice_enabled: true })).toEqual({
      enabled: true,
      deposit_enabled: false,
      voice_enabled: true,
    });
    // Une ligne d'avant la colonne (lecture d'un ancien déploiement) : fermé.
    expect(readPortalAssistant({ enabled: true, deposit_enabled: true }).voice_enabled).toBe(false);
  });

  it("⚠️ courrier libre (1.38.0) : fermé tant que rien ne l'ouvre, et jamais sans Clara", () => {
    const closed = { enabled: false, title: null };
    for (const raw of [null, undefined, [], "oui", 1, { enabled: "true" }, [{ enabled: true }]]) {
      expect(readPortalFreeMail(raw, true)).toEqual(closed);
    }
    // Ouvert par l'organisme, mais la collectivité n'est pas abonnée à Clara :
    // personne ne recevrait le courrier — fermé à la frontière, titre conservé.
    expect(readPortalFreeMail({ enabled: true, title: "Nous écrire" }, false)).toEqual({
      enabled: false,
      title: "Nous écrire",
    });
    expect(readPortalFreeMail({ enabled: true, title: null }, true)).toEqual({ enabled: true, title: null });
  });

  it("courrier libre : le titre sort trimé, vide = null, et rien d'autre de la ligne", () => {
    expect(readPortalFreeMail({ enabled: true, title: "  Écrire à la mairie  " }, true).title).toBe(
      "Écrire à la mairie",
    );
    expect(readPortalFreeMail({ enabled: true, title: "   " }, true).title).toBeNull();
    expect(readPortalFreeMail({ enabled: true, title: "x".repeat(81) }, true).title).toBeNull();
    // Le titre est servi même fermé : le réglage gouverne l'usage, pas la donnée.
    expect(readPortalFreeMail({ enabled: false, title: "Nous écrire" }, true)).toEqual({
      enabled: false,
      title: "Nous écrire",
    });
    const dto = readPortalFreeMail(
      { organization_id: "org-1", enabled: true, title: "T", updated_by: "user-1", updated_at: "2026-10-09" },
      true,
    );
    expect(Object.keys(dto).sort()).toEqual(["enabled", "title"]);
  });

  it("⚠️ un tenant sans thème publié reçoit les DÉFAUTS, jamais null", () => {
    // Le portail n'a pas à inventer des valeurs que le Socle connaît : deux
    // jeux de défauts finiraient par diverger.
    const dto = serializeTenant(row, "nantes.edilumen.fr", null, null);
    expect(dto.theme).toEqual(defaultPortalThemeDto());
  });

  it("sert le thème publié quand il y en a un", () => {
    const dto = serializeTenant(row, "nantes.edilumen.fr", null, {
      typography: { font: "rubik", scale: "compact" },
      header: { fill: "color", color: "secondary", logoWhite: false },
      accessibility: { highContrast: true, declaration: "Audit du 12 juin 2026" },
    });
    expect(dto.theme.typography).toEqual({ font: "rubik", text_scale: "compact" });
    expect(dto.theme.header).toMatchObject({ fill: "color", color: "secondary", logo_white: false });
    expect(dto.theme.accessibility.high_contrast).toBe(true);
    expect(dto.theme.accessibility.declaration).toBe("Audit du 12 juin 2026");
    // Ce que le thème stocké ne disait pas reprend son défaut.
    expect(dto.theme.shapes).toEqual(defaultPortalThemeDto().shapes);
    expect(dto.theme.accessibility.dark_primary).toBe(false);
  });

  it("⚠️ le lien de la mention n'est servi que si une déclaration est publiée", () => {
    const theme = { accessibility: { declaration: "Accessibilité : partiellement conforme" } };
    expect(serializeTenant(row, "n.fr", null, theme).theme.accessibility.declaration_link).toBe(false);
    expect(serializeTenant(row, "n.fr", null, theme, true).theme.accessibility.declaration_link).toBe(
      true,
    );
  });

  it("rend le domaine tel que résolu, pas celui demandé", () => {
    // Le portail normalise son entrée, la base stocke la forme canonique : la
    // réponse porte celle de la BASE, pour que le portail sache sur quelle clé
    // le tenant a été trouvé sans refaire la normalisation.
    expect(serializeTenant(row, "demarches.nantes.fr", null, null).hostname).toBe("demarches.nantes.fr");
  });

  it("tolère un slug absent", () => {
    expect(serializeTenant({ ...row, slug: null }, "nantes.edilumen.fr", null, null).slug).toBeNull();
  });

  it("sert toujours le français, en tête, quoi qu'il arrive", () => {
    // Une résolution qui échoue ou une collectivité sans réglage ne doivent pas
    // fermer le portail : il reste la langue dont on est certain.
    expect(serializeTenant(row, "n.fr", null, null).languages).toEqual(["fr"]);
    expect(serializeTenant(row, "n.fr", "br", null).languages).toEqual(["fr"]);
    expect(serializeTenant(row, "n.fr", ["br"], null).languages).toEqual(["fr", "br"]);
  });

  it("écarte ce qui n'est pas un code de langue, et les doublons", () => {
    expect(serializeTenant(row, "n.fr", [" BR ", "br", 42, "", "!!", "en"], null).languages).toEqual([
      "fr",
      "br",
      "en",
    ]);
  });
});

describe("serializePortalProcedure — le paramétrage d'instruction ne sort pas", () => {
  const row = {
    id: "proc-1",
    name: "Demande d'acte de naissance",
    short_description: "En quelques minutes.",
    user_description: "Adressée au service état civil.",
    input_duration_minutes: 5,
    translations: { br: { name: "Testeni ganedigezh" } },
    // Tout ce qui suit sert à INSTRUIRE la demande, pas à la proposer. Un
    // portail public n'a rien à en faire, et le seul fait de le lui transmettre
    // le publierait.
    agent_description: "Vérifier la filiation avant validation.",
    form_schema: { fields: [{ id: "nom" }] },
    requester_config: { identity: "required" },
    knowledge_base: { agent: { documents: ["org/notice.pdf"] } },
    communication_config: { visibility: { portalVisible: true } },
    documents: { items: [{ id: "tpl-1" }] },
    keywords: ["état civil"],
    organization_id: "org-1",
    category_id: "cat-1",
  };

  it("n'expose que les neuf champs publics", () => {
    expect(serializePortalProcedure(row)).toEqual({
      id: "proc-1",
      name: "Demande d'acte de naissance",
      short_description: "En quelques minutes.",
      user_description: "Adressée au service état civil.",
      input_duration_minutes: 5,
      // Rien de réglé dans la fixture : l'accès est libre, comme il l'était
      // avant que la colonne existe.
      access_mode: "libre",
      organizations: [],
      // `requester_config` de la fixture ne déclare aucun public connu : rien
      // à servir. ⚠️ Pas « tous publics » — voir le test dédié plus bas.
      audiences: [],
      // Des libellés, pas du paramétrage : le portail en a besoin pour servir
      // la démarche dans la langue choisie par l'usager.
      translations: { br: { name: "Testeni ganedigezh" } },
    });
  });

  /**
   * Les publics d'une démarche — le seul champ DÉRIVÉ de la liste.
   *
   * ⚠️ Miroir volontaire d'`enabledAudiences`
   * (`src/features/procedures/requesterFields.ts`) : une edge function ne peut
   * rien importer de `src/`, et ce sont les tests des deux côtés qui empêchent
   * les deux lectures de diverger — motif `portalCatalogue.ts`.
   */
  describe("les publics traversent, la configuration qui les porte non", () => {
    const withConfig = (requester_config: unknown) =>
      serializePortalProcedure({ id: "p", name: "X", requester_config });

    it("sert les publics activés, dans l'ordre du paramétrage", () => {
      expect(
        withConfig({
          association: { enabled: true, fields: { courriel: "obligatoire" } },
          citoyen: { enabled: true, fields: {} },
          entreprise: { enabled: false, fields: {} },
        }).audiences,
      ).toEqual(["citoyen", "association"]);
    });

    it("ne sert QUE les noms — jamais les champs demandés au requérant", () => {
      const dto = withConfig({
        citoyen: { enabled: true, fields: { nir: "obligatoire" } },
      }) as Record<string, unknown>;
      expect(dto.audiences).toEqual(["citoyen"]);
      expect(dto).not.toHaveProperty("requester_config");
      expect(JSON.stringify(dto)).not.toContain("nir");
    });

    it("rend une liste VIDE quand rien n'est paramétré, jamais les trois publics", () => {
      // La lire comme « tous publics » ferait apparaître la démarche sous des
      // publics auxquels elle n'est pas ouverte.
      for (const raw of [null, undefined, {}, "citoyen", ["citoyen"], { citoyen: { enabled: "oui" } }]) {
        expect(withConfig(raw).audiences, JSON.stringify(raw) ?? "undefined").toEqual([]);
      }
    });
  });

  it("recopie les organismes qui proposent la démarche, dans l'ordre reçu, et rien d'autre d'eux", () => {
    const dto = serializePortalProcedure(row, [
      { id: "accm", name: "ACCM", slug: "laurentville", logoUrl: "https://exemple.fr/accm.png", handlingOrganizationId: null, status: "active", email: "x@y" } as never,
      {
        id: "arles",
        name: "Mairie d'Arles",
        slug: "mairie-d-arles",
        // Pas de logo à elle : la liste affichera un repli neutre, pas celui de
        // l'intercommunalité.
        logoUrl: null,
        handlingOrganizationId: "service-etat-civil",
      },
    ]);
    expect(dto.organizations).toEqual([
      {
        id: "accm",
        name: "ACCM",
        slug: "laurentville",
        logo_url: "https://exemple.fr/accm.png",
        handling_organization_id: null,
      },
      // Le service interne qui instruit voyage par son IDENTIFIANT seul : son
      // nom ne sort pas — ni son slug, qui serait une adresse vers un service
      // que la collectivité a choisi de ne pas montrer. Ce sont ceux du
      // PORTEUR qui sortent.
      {
        id: "arles",
        name: "Mairie d'Arles",
        slug: "mairie-d-arles",
        logo_url: null,
        handling_organization_id: "service-etat-civil",
      },
    ]);
  });

  it("ne laisse fuir aucun élément d'instruction", () => {
    const dto = serializePortalProcedure(row) as Record<string, unknown>;
    for (const leak of [
      "agent_description",
      "form_schema",
      "requester_config",
      "knowledge_base",
      "communication_config",
      "documents",
    ]) {
      expect(dto).not.toHaveProperty(leak);
    }
  });

  it("⚠️ sert une démarche réservée comme les autres, en le DISANT", () => {
    // Le portail doit la montrer : c'est en la lisant que l'usager apprend
    // qu'il doit se connecter. Elle n'est pas retirée du catalogue — la
    // publication se décide en amont (`publishedCatalogue`), et `access_mode`
    // n'y entre pas.
    const dto = serializePortalProcedure({ ...row, access_mode: "authentifie" });
    expect(dto.access_mode).toBe("authentifie");
    expect(dto.id).toBe("proc-1");
  });

  it("tolère les descriptifs absents — aucun n'est obligatoire au paramétrage", () => {
    const dto = serializePortalProcedure({ id: "p", name: "Sans descriptif" });
    expect(dto.short_description).toBeNull();
    expect(dto.user_description).toBeNull();
    expect(dto.input_duration_minutes).toBeNull();
  });
});

describe("serializePortalProcedureDetail — le formulaire sort, l'instruction non", () => {
  const row = {
    id: "proc-1",
    name: "Demande d'acte de naissance",
    short_description: "En quelques minutes.",
    user_description: "Adressée au service état civil.",
    input_duration_minutes: 5,
    // La même ligne porte les deux : `audiences` en est l'extrait qui sert à
    // filtrer une liste, `requester_config` la configuration complète.
    requester_config: { citoyen: { enabled: true, fields: { courriel: "obligatoire" } } },
    translations: { br: { name: "Testeni ganedigezh" } },
  };
  const detail = {
    id: "proc-1",
    category_id: "cat-1",
    form_schema: { version: 1, content: [{ id: "f1", key: "nom", type: "text", label: "Nom" }] },
    requester_config: { citoyen: { enabled: true, fields: { courriel: "obligatoire" } } },
    user_communication: {
      delays: { processingTimeValue: 3, processingTimeUnit: "semaine" },
      audience: { note: "Réservée aux résidents." },
      attachments: { items: [{ label: "Justificatif de domicile", description: "3 mois" }] },
      faq: { items: [{ question: "Où déposer ?", answer: "En ligne." }] },
    },
  };
  const category = { id: "cat-1", name: "État civil", translations: { br: { name: "Stad-civil" } } };

  it("ajoute au public de la liste la catégorie et les deux schémas de saisie", () => {
    const dto = serializePortalProcedureDetail(
      row,
      [{ id: "accm", name: "ACCM", slug: "laurentville", logoUrl: null, handlingOrganizationId: null }],
      detail,
      category,
    );
    expect(dto).toEqual({
      id: "proc-1",
      name: "Demande d'acte de naissance",
      short_description: "En quelques minutes.",
      user_description: "Adressée au service état civil.",
      input_duration_minutes: 5,
      access_mode: "libre",
      organizations: [
        {
          id: "accm",
          name: "ACCM",
          slug: "laurentville",
          logo_url: null,
          handling_organization_id: null,
        },
      ],
      audiences: ["citoyen"],
      translations: { br: { name: "Testeni ganedigezh" } },
      category: { id: "cat-1", name: "État civil", translations: { br: { name: "Stad-civil" } } },
      form_schema: detail.form_schema,
      requester_config: detail.requester_config,
      user_communication: detail.user_communication,
    });
  });

  it("⚠️ user_communication vient du DÉTAIL, pas de la ligne du catalogue", () => {
    // Comme `form_schema` : la colonne n'est lue en base qu'APRÈS la décision de
    // publication. Une démarche non publiée ne peut donc pas en laisser sortir.
    const dto = serializePortalProcedureDetail(
      { ...row, user_communication: { faq: { items: [{ question: "Q", answer: "R" }] } } },
      [],
      null,
      null,
    );
    expect(dto.user_communication).toBeNull();
  });

  it("transmet le bloc TEL QUEL, sans le réinterpréter", () => {
    const dto = serializePortalProcedureDetail(row, [], detail, null);
    expect(dto.user_communication).toBe(detail.user_communication);
  });

  it("les traductions traversent avec leurs entrées, le descriptif traduit avec la ligne (1.26.0)", () => {
    // Rien à résoudre ici : la traduction d'une question vit SUR la question,
    // celle du descriptif dans la colonne `translations`. Le portail replie.
    const translated = {
      ...detail,
      user_communication: {
        faq: {
          items: [{ question: "Q", answer: "R", translations: { en: { question: "Q en" } } }],
        },
      },
    };
    const dto = serializePortalProcedureDetail(
      { ...row, translations: { en: { user_description: "In English." } } },
      [],
      translated,
      null,
    );
    expect(dto.user_communication).toEqual(translated.user_communication);
    expect(dto.translations).toEqual({ en: { user_description: "In English." } });
  });

  it("⚠️ la LISTE ne le porte pas : ce contenu appartient à la page d'une démarche", () => {
    const list = serializePortalProcedure({ ...row, user_communication: detail.user_communication });
    expect(list).not.toHaveProperty("user_communication");
  });

  it("recopie le schéma TEL QUEL — le réécrire ici en ferait une seconde grammaire", () => {
    const dto = serializePortalProcedureDetail(row, [], detail, null);
    expect(dto.form_schema).toBe(detail.form_schema);
    expect(dto.requester_config).toBe(detail.requester_config);
  });

  it("ne laisse pas fuir ce qu'un agent seul doit lire", () => {
    const dto = serializePortalProcedureDetail(
      { ...row, knowledge_base: { agent: {} }, agent_description: "Vérifier la filiation." },
      [],
      { ...detail, knowledge_base: { agent: {} }, agent_description: "Vérifier la filiation." },
      null,
    ) as Record<string, unknown>;
    for (const leak of ["agent_description", "knowledge_base", "communication_config", "documents"]) {
      expect(dto).not.toHaveProperty(leak);
    }
  });

  it("une démarche sans catégorie ni formulaire se sert quand même", () => {
    // Cas courant d'une démarche qu'on vient de créer : elle s'affiche, sans
    // saisie. Ce n'est pas une erreur, et le portail ne doit pas la refuser.
    const dto = serializePortalProcedureDetail(row);
    expect(dto.category).toBeNull();
    expect(dto.form_schema).toBeNull();
    expect(dto.requester_config).toBeNull();
  });
});
