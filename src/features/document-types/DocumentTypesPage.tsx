import { PageHeader } from "@/components/shared/PageHeader";
import { DocumentTypesManager } from "@/features/document-types/DocumentTypesManager";

export function DocumentTypesPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Types de pièce justificative"
        subtitle="Le catalogue des pièces demandées aux usagers dans vos démarches."
      />
      <DocumentTypesManager />
    </div>
  );
}
