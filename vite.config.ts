/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    // Logique pure pour l'instant → environnement Node (rapide, pas de DOM).
    // Passer à "jsdom" quand on ajoutera des tests de composants.
    environment: "node",
    globals: true,
    // Valeurs factices : `src/lib/supabase.ts` lève au chargement sans elles, et
    // la CI n'a pas de `.env.local`. Aucun test n'atteint le réseau.
    env: {
      VITE_SUPABASE_URL: "http://localhost:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    },
    // `src/**` + la logique pure des edge functions (co-localisée dans `_shared`,
    // sans dépendance Deno) — voir supabase/functions/public-api/_shared.
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "supabase/functions/**/*.{test,spec}.ts",
    ],
  },
});
