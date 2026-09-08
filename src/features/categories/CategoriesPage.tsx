import { PageHeader } from "@/components/shared/PageHeader";
import { CategoriesManager } from "@/features/categories/CategoriesManager";

/** Écran admin `/categories` : toutes les catégories visibles, conteneur fin. */
export function CategoriesPage() {
  return (
    <div className="p-6">
      <PageHeader title="Catégories" subtitle="Regroupez les démarches par thématique." />
      <CategoriesManager />
    </div>
  );
}
