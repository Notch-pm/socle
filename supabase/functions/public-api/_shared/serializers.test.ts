import { describe, expect, it } from "vitest";
import {
  serializeCategory,
  serializeDocumentType,
  serializeOrganization,
  serializeOrganizationProcedure,
  serializeProcedure,
  serializeQuartier,
  serializeSmtpSettings,
} from "./serializers.ts";

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

  it("catégorie : libellé + icône", () => {
    const dto = serializeCategory({
      id: "c1",
      organization_id: "org-1",
      name: "État civil",
      icon: "FileText",
      created_at: null,
      internal: "x",
    });
    expect(dto).toEqual({
      id: "c1",
      organization_id: "org-1",
      name: "État civil",
      icon: "FileText",
      created_at: null,
    });
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
    });
    expect(dto.keywords).toEqual([]);
    expect(dto.form_schema).toBe(form);
    expect(dto).not.toHaveProperty("is_active_global");
    // JSON possédé : transmis tel quel, jamais réinterprété.
    expect(dto.communication_config).toEqual({ visibility: { portalVisible: false } });
  });

  it("démarche jamais paramétrée : communication_config vaut null, pas undefined", () => {
    const dto = serializeProcedure({ id: "p2", name: "Sans communication", type: "externe" });
    expect(dto.communication_config).toBeNull();
    expect(Object.keys(dto)).toContain("communication_config");
  });

  it("statut : seule « production » l'est ; le doute ne publie rien", () => {
    expect(serializeProcedure({ status: "production" }).status).toBe("production");
    expect(serializeProcedure({ status: "brouillon" }).status).toBe("brouillon");
    // Colonne absente, nulle ou inattendue → brouillon.
    for (const status of [undefined, null, "", "PRODUCTION", 1, true]) {
      expect(serializeProcedure({ status }).status).toBe("brouillon");
    }
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
