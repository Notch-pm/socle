import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export function PlaceholderPage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="p-6">
      <PageHeader title={title} subtitle={subtitle} />
      <EmptyState message="Cet écran arrive prochainement." />
    </div>
  );
}
