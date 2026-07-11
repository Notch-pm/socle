import * as React from "react";

/**
 * Page de documentation **lisible par un humain** de l'API publique (rendu type
 * Swagger via Redoc). Elle est servie **par l'application** et non par l'edge
 * function : la passerelle Supabase force les réponses HTML des functions en
 * `text/plain` + CSP `sandbox` (anti-hameçonnage sur `*.supabase.co`), ce qui
 * empêche un rendu HTML depuis la function. On charge donc Redoc ici et on le
 * pointe sur le contrat public `/openapi.json` (servi, lui, en JSON par la function).
 *
 * Route **publique** (`/api-doc`) : consultable sans authentification, y compris
 * par un partenaire externe.
 */

const SPEC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-api/openapi.json`;
const REDOC_SRC = "https://cdn.jsdelivr.net/npm/redoc@2.1.5/bundles/redoc.standalone.js";

declare global {
  interface Window {
    Redoc?: { init: (spec: string, options: unknown, element: HTMLElement) => void };
  }
}

export function ApiDocsPage() {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;

    const render = () => {
      if (cancelled || !containerRef.current || !window.Redoc) return;
      window.Redoc.init(
        SPEC_URL,
        { hideDownloadButton: false, expandResponses: "200", theme: { colors: { primary: { main: "#0aaa6b" } } } },
        containerRef.current,
      );
    };

    if (window.Redoc) {
      render();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${REDOC_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", render);
      return () => {
        cancelled = true;
        existing.removeEventListener("load", render);
      };
    }

    const script = document.createElement("script");
    script.src = REDOC_SRC;
    script.async = true;
    script.addEventListener("load", render);
    document.body.appendChild(script);
    return () => {
      cancelled = true;
      script.removeEventListener("load", render);
    };
  }, []);

  return <div ref={containerRef} style={{ minHeight: "100vh" }} />;
}
