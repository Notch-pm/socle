import * as React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  /** Déjà formaté (`fr-FR`, ou « — ») : la tuile affiche, elle ne calcule pas. */
  value: string;
  sub?: string;
  Icon: React.ElementType;
  iconClassName?: string;
  href?: string;
  loading: boolean;
}

/**
 * Tuile d'indicateur — motif Clara/Iris : titre discret + icône, valeur en
 * `text-3xl`, sous-ligne.
 *
 * ⚠️ `tabular-nums` : sans lui, les chiffres changent de largeur d'un rendu à
 * l'autre et la rangée de tuiles frémit à chaque rafraîchissement.
 *
 * ⚠️ La valeur arrive **déjà formatée**. Formater ici obligerait chaque appelant
 * à passer un nombre, or « — » (un taux sans dénominateur) n'en est pas un — et
 * c'est précisément le cas qu'il ne faut pas afficher « 0 ».
 */
export function KpiCard({ label, value, sub, Icon, iconClassName, href, loading }: KpiCardProps) {
  const inner = (
    <Card className={cn("h-full", href && "cursor-pointer transition-shadow hover:shadow-socle-md")}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={cn("size-5 shrink-0", iconClassName ?? "text-primary")} aria-hidden="true" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-9 w-16 animate-pulse rounded bg-muted/60" />
        ) : (
          <div className="text-3xl font-bold tabular-nums">{value}</div>
        )}
        {sub !== undefined && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link to={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
