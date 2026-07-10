import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ProcedureEditor } from "@/features/procedures/ProcedureEditor";

/**
 * Page pleine hauteur hébergeant le stepper de paramétrage d'une démarche
 * (en-tête et pied fixes, seul le formulaire scrolle). Sert les deux zones :
 *  - admin       : /demarches/nouveau?org=:root  ·  /demarches/:procId
 *  - superadmin  : /superadmin/organisations/:orgId/demarches/nouveau|:procId
 */
export function ProcedureEditorPage({ variant }: { variant: "admin" | "superadmin" }) {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const isSuper = variant === "superadmin";
  const procedureId = params.procId;
  const initialStep = Number(searchParams.get("step") ?? "0") || 0;
  const organizationId = isSuper ? params.orgId : (searchParams.get("org") ?? undefined);

  const listPath = isSuper ? `/superadmin/organisations/${params.orgId}` : "/demarches";
  const editBase = isSuper
    ? `/superadmin/organisations/${params.orgId}/demarches`
    : "/demarches";

  // Remplit toute la hauteur de la zone principale (main sans padding dans les
  // deux layouts) ; l'éditeur gère son propre scroll interne.
  return (
    <div className="h-full">
      <ProcedureEditor
        organizationId={organizationId}
        procedureId={procedureId}
        initialStep={initialStep}
        onClose={() => navigate(listPath)}
        onCreated={(id) => navigate(`${editBase}/${id}?step=1`)}
      />
    </div>
  );
}
