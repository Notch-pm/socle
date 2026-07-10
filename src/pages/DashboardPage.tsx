import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export function DashboardPage() {
  return (
    <div className="p-6">
      <PageHeader title="Tableau de bord" subtitle="Vue d'ensemble de votre activité." />
      <EmptyState message="Le contenu du tableau de bord arrive prochainement." />
    </div>
  );
}
