/**
 * Le « monde » d'un test de contacts-api côté usager : `contacts-api/index.ts`
 * RÉEL (chargé avec un `Deno` minimal), son client Supabase remplacé par
 * `fakeSupabase` (PGlite + la vraie migration `citizen`), deux collectivités
 * (dont l'une avec un organisme enfant), une clé plateforme « Nora ».
 */
import type { PGlite } from "@electric-sql/pglite";
import { vi } from "vitest";
import { createFakeSupabase } from "./fakeSupabase.ts";
import { freshSocleDb } from "./socleDb.ts";

export const KEY = "sk_live_nora_test_key";

export interface Reply {
  status: number;
  body: any;
  headers: Headers;
  text: string;
}

export interface CallOptions {
  key?: string | null;
  org?: string | null;
  json?: unknown;
  body?: string;
}

type Handler = (request: Request) => Promise<Response>;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export class SocleWorld {
  db!: PGlite;
  sceaux!: string;
  sceauxQuartier!: string;
  antony!: string;
  private handler!: Handler;

  static async create(): Promise<SocleWorld> {
    const world = new SocleWorld();
    world.db = await freshSocleDb();
    await world.seed();
    await world.boot();
    return world;
  }

  private async seed(): Promise<void> {
    const org = async (name: string, parent: string | null) =>
      (await this.db.query<{ id: string }>("insert into organizations (name, parent_id) values ($1, $2) returning id", [name, parent])).rows[0].id;
    this.sceaux = await org("Ville de Sceaux", null);
    this.sceauxQuartier = await org("Mairie de quartier", this.sceaux);
    this.antony = await org("Ville d'Antony", null);
    for (const root of [this.sceaux, this.antony]) {
      await this.db.query("insert into org_applications (organization_id, application) values ($1, 'nora')", [root]);
    }
    await this.addKey(KEY, ["read", "citizen", "smtp"], { consumer: "nora" });
  }

  async addKey(
    key: string,
    scopes: string[],
    extra: { consumer?: string | null; organizationId?: string | null; revoked?: boolean; expired?: boolean } = {},
  ): Promise<void> {
    await this.db.query(
      "insert into api_keys (organization_id, key_hash, scopes, consumer, revoked_at, expires_at) values ($1, $2, $3, $4, $5, $6)",
      [
        extra.organizationId ?? null,
        await sha256Hex(key),
        scopes,
        extra.consumer === undefined ? null : extra.consumer,
        extra.revoked ? new Date().toISOString() : null,
        extra.expired ? new Date(Date.now() - 1000).toISOString() : null,
      ],
    );
  }

  private async boot(): Promise<void> {
    (globalThis as Record<string, unknown>).Deno = {
      env: { get: (name: string) => ({ SUPABASE_URL: "http://socle.test", SUPABASE_SERVICE_ROLE_KEY: "service-role" } as Record<string, string>)[name] },
      serve: (handler: Handler) => {
        this.handler = handler;
      },
    };
    vi.resetModules();
    vi.doMock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => createFakeSupabase(this.db) }));
    const entry = "../../index.ts";
    await import(/* @vite-ignore */ entry);
  }

  async close(): Promise<void> {
    vi.doUnmock("https://esm.sh/@supabase/supabase-js@2");
    delete (globalThis as Record<string, unknown>).Deno;
  }

  async call(method: string, path: string, options: CallOptions = {}): Promise<Reply> {
    const headers = new Headers();
    const key = options.key === undefined ? KEY : options.key;
    if (key !== null) headers.set("authorization", `Bearer ${key}`);
    const org = options.org === undefined ? this.sceaux : options.org;
    if (org !== null) headers.set("x-organization-id", org);
    if (options.json !== undefined) headers.set("content-type", "application/json");
    const response = await this.handler(
      new Request(`http://socle.test/functions/v1/contacts-api${path}`, {
        method,
        headers,
        body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
      }),
    );
    const text = await response.text();
    let body: unknown = text;
    try {
      body = text === "" ? null : JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: response.status, body, headers: response.headers, text };
  }

  /** Une fiche déjà au référentiel (saisie d'agent, dépôt antérieur…), avec une note interne sentinelle. */
  async seedContact(root: string, partial: Record<string, unknown> = {}): Promise<string> {
    const row = {
      contact_type: "personne",
      civility: "madame",
      first_name: "Camille",
      last_name: "Durand",
      email: "camille@example.org",
      postal_code: "92330",
      city: "Sceaux",
      address_line1: "12 rue Houdan",
      internal_notes: "NOTE INTERNE : usager difficile, ne pas rappeler",
      ...partial,
    };
    const keys = Object.keys(row);
    const res = await this.db.query<{ id: string }>(
      `insert into contacts (organization_id, ${keys.join(", ")}) values ($1, ${keys.map((_, i) => "$" + (i + 2)).join(", ")}) returning id`,
      [root, ...keys.map((k) => (row as Record<string, unknown>)[k])],
    );
    return res.rows[0].id;
  }

  async sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
    return (await this.db.query<T>(query, params)).rows;
  }
}

export const IDENTITY = {
  civility: "madame",
  first_name: "Camille",
  last_name: "Durand",
  email: "camille@example.org",
  address_line1: "12 rue Houdan",
  postal_code: "92330",
  city: "Sceaux",
};
