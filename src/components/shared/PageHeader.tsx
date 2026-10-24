import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
  section,
}: {
  title: string;
  subtitle?: string;
  /** Rubrique du rail (ou « Paramètres ») d'où l'on vient, rappelée au-dessus du titre. */
  section?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        {section ? (
          <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            {section}
            <ChevronRight aria-hidden="true" className="size-3" />
            <span className="sr-only"> : </span>
            {title}
          </p>
        ) : null}
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
