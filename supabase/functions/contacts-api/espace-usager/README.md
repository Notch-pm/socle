# Tests de contacts-api côté usager (scope `citizen`, 1.4.0)

```bash
npx vitest run supabase/functions/contacts-api/espace-usager
```

- `harness/` : `contacts-api/index.ts` réel (Deno minimal), client Supabase remplacé par PGlite
  (schéma réduit du référentiel + VRAIE migration `20261020120000_contacts_citizen.sql`).
- `citizen.contract.test.ts` : clés et scopes, périmètre (collectivité racine, abonnement),
  isolation entre comptes et entre collectivités, liste blanche de la fiche (jamais
  `internal_notes`), rattachement STRICT (courriel + nom + prénom + code postal + date de
  naissance), PATCH des seules coordonnées, consentements composés par le Socle.
- `migrations.sql.test.ts` : contrainte des scopes, droits, `citizen_contact_link`.
- Anomalies laissées en échec attendu : S1 (date de naissance impossible → 500), S2 (garde SQL des
  noms blancs sans effet), S3 (noms non latins jamais rattachés).
