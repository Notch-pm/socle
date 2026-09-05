import { PageHeader } from "@/components/shared/PageHeader";
import { DocumentTemplatesManager } from "@/features/documents/DocumentTemplatesManager";

export function DocumentsPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Documents"
        subtitle="Les modèles de documents et de courriers de votre collectivité, et leurs variables."
      />
      <DocumentTemplatesManager />
    </div>
  );
}
