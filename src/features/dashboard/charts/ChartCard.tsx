import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ChartCardProps {
  title: string;
  loading: boolean;
  /** Vrai quand la requête a répondu et qu'il n'y a rien à dessiner. */
  empty?: boolean;
  emptyText?: string;
  /** Hauteur réservée aux états chargement/vide (celle du graphique). */
  height?: number;
  children: React.ReactNode;
}

/**
 * Carte d'un graphique — motif Iris/Clara : titre discret, squelette, état vide.
 *
 * Le squelette est un `animate-pulse` en ligne : le Socle n'a pas de composant
 * `Skeleton`, il emploie cette classe telle quelle partout ailleurs (voir
 * « Composition » dans CLAUDE.md).
 */
export function ChartCard({
  title,
  loading,
  empty = false,
  emptyText = "Aucune donnée sur la période sélectionnée",
  height = 280,
  children,
}: ChartCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="w-full animate-pulse rounded-lg bg-muted/40" style={{ height }} />
        ) : empty ? (
          <div
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ height }}
          >
            {emptyText}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
