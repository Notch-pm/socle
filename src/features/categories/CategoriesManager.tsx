import * as React from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { iconFor } from "@/features/categories/icon-options";
import {
  useCategoriesQuery,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  type Category,
} from "@/features/categories/useCategories";
import { CategoryFormDialog, type CategoryFormValues } from "@/features/categories/CategoryFormDialog";
import { TranslatedIn } from "@/features/languages/TranslatedIn";
import type { Json } from "@/types/database.types";

/**
 * Liste + CRUD des catégories. Deux modes, motif `DocumentTypesManager` :
 * - `organizationId` fourni → **une organisation** (section superadmin d'une
 *   racine) : la liste est bornée à elle et le dialogue la verrouille ;
 * - sans → **toutes les catégories visibles** (page admin `/categories`) : le
 *   dialogue propose un sélecteur d'organisation.
 *
 * Le super administrateur ne pouvait pas créer de catégorie avant ce
 * composant : `/categories` vit dans l'app par organisation, dont
 * `ProtectedRoute` le redirige. Or une démarche exige une catégorie — un
 * client ne pouvait donc pas être livré clé en main sans SQL.
 */
export function CategoriesManager({ organizationId }: { organizationId?: string }) {
  const { data: categories, isLoading, isError } = useCategoriesQuery(organizationId);
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Category | null>(null);
  const [deleting, setDeleting] = React.useState<Category | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(category: Category) {
    setEditing(category);
    setFormOpen(true);
  }

  function handleSubmit(values: CategoryFormValues) {
    // Traductions typées de l'app → colonne JSONB générique de Supabase.
    const payload = { ...values, translations: values.translations as unknown as Json };
    if (editing) {
      updateCategory.mutate(
        { id: editing.id, ...payload },
        { onSuccess: () => setFormOpen(false) },
      );
    } else {
      createCategory.mutate(payload, { onSuccess: () => setFormOpen(false) });
    }
  }

  function confirmDelete() {
    if (!deleting) return;
    deleteCategory.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
  }

  const submitting = createCategory.isPending || updateCategory.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus />
          Nouvelle catégorie
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse border-b border-border bg-muted/40 last:border-b-0" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">Impossible de charger les catégories.</p>
      ) : categories && categories.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-12 px-4 py-3" />
                <th className="px-4 py-3">Libellé</th>
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => {
                const Icon = iconFor(category.icon);
                return (
                  <tr key={category.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Icon className="size-4" />
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {category.name}
                      <TranslatedIn translations={category.translations} className="ml-2" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Modifier"
                          onClick={() => openEdit(category)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Supprimer"
                          onClick={() => setDeleting(category)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="Aucune catégorie configurée : une démarche ne peut pas être créée sans catégorie." />
      )}

      <CategoryFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editing}
        fixedOrganizationId={organizationId}
        onSubmit={handleSubmit}
        submitting={submitting}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {deleting?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
