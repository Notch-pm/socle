import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ProtectedRoute, SuperAdminRoute } from "@/components/layout/ProtectedRoute";
import { AppShell } from "@/components/layout/AppShell";
import { SuperAdminLayout } from "@/components/layout/SuperAdminLayout";
import { LoginPage } from "@/features/auth/LoginPage";
import { SetPasswordPage } from "@/features/auth/SetPasswordPage";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { CategoriesPage } from "@/features/categories/CategoriesPage";
import { DocumentTypesPage } from "@/features/document-types/DocumentTypesPage";
import { DocumentsPage } from "@/features/documents/DocumentsPage";
import { OrganizationsPage } from "@/features/organizations/OrganizationsPage";
import { OrganizationEditorPage } from "@/features/organizations/OrganizationEditorPage";
import { ProceduresPage } from "@/features/procedures/ProceduresPage";
import { ProcedureEditorPage } from "@/features/procedures/ProcedureEditorPage";
import { PortalEditorPage } from "@/features/portal/PortalEditorPage";
import { QuartiersPage } from "@/features/quartiers/QuartiersPage";
import { AiUsagePage } from "@/features/ai-usage/AiUsagePage";
import { UtilisateursPage } from "@/pages/UtilisateursPage";
import { SuperAdminDashboardPage } from "@/features/superadmin/SuperAdminDashboardPage";
import { OrgSettingsPage } from "@/features/superadmin/organizations/OrgSettingsPage";
import { PlatformApiKeysPage } from "@/features/superadmin/PlatformApiKeysPage";
import { PlatformSettingsPage } from "@/features/superadmin/platform/PlatformSettingsPage";
import { SuperAdminAiUsagePage } from "@/features/superadmin/SuperAdminAiUsagePage";
import { ApiDocsPage } from "@/features/public-api-docs/ApiDocsPage";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/mot-de-passe-oublie" element={<ForgotPasswordPage />} />
          <Route path="/activer-compte" element={<SetPasswordPage />} />
          <Route path="/reinitialiser-mot-de-passe" element={<SetPasswordPage />} />

          {/* Documentation publique des APIs (rendu Redoc des contrats OpenAPI) */}
          <Route path="/api-doc" element={<ApiDocsPage />} />
          <Route path="/api-doc-usagers" element={<ApiDocsPage api="contacts-api" />} />
          <Route path="/api-doc-ia" element={<ApiDocsPage api="ai-api" />} />

          {/* Super admin — separate area, separate menu, only reachable by global_role = super_admin */}
          <Route element={<SuperAdminRoute />}>
            <Route element={<SuperAdminLayout />}>
              <Route path="/superadmin" index element={<SuperAdminDashboardPage />} />
              <Route path="/superadmin/cles-plateforme" element={<PlatformApiKeysPage />} />
              <Route path="/superadmin/plateforme" element={<PlatformSettingsPage />} />
              <Route path="/superadmin/ia" element={<SuperAdminAiUsagePage />} />
              {/* La vue d'ensemble n'existe plus : chaque organisation principale a sa page. */}
              <Route
                path="/superadmin/organisations"
                element={<Navigate to="/superadmin" replace />}
              />
              <Route path="/superadmin/organisations/:orgId" element={<OrgSettingsPage />} />
              <Route
                path="/superadmin/organisations/:orgId/demarches/nouveau"
                element={<ProcedureEditorPage variant="superadmin" />}
              />
              <Route
                path="/superadmin/organisations/:orgId/demarches/:procId"
                element={<ProcedureEditorPage variant="superadmin" />}
              />
              {/* Éditeur du site de démarches — plein écran, comme l'éditeur de démarche. */}
              <Route
                path="/superadmin/organisations/:orgId/portail"
                element={<PortalEditorPage variant="superadmin" />}
              />
            </Route>
          </Route>

          {/* Regular per-organization app */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="organisations" element={<OrganizationsPage />} />
              <Route path="organisations/:orgId" element={<OrganizationEditorPage />} />
              <Route path="demarches" element={<ProceduresPage />} />
              <Route path="demarches/nouveau" element={<ProcedureEditorPage variant="admin" />} />
              <Route path="demarches/:procId" element={<ProcedureEditorPage variant="admin" />} />
              {/* Éditeur du site de démarches — plein écran, organisation choisie dans la page. */}
              <Route path="site-de-demarches" element={<PortalEditorPage variant="admin" />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="types-pieces" element={<DocumentTypesPage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="quartiers" element={<QuartiersPage />} />
              <Route path="utilisateurs" element={<UtilisateursPage />} />
              {/* Consultation seule — le plafond se règle côté superadmin. */}
              <Route path="consommation-ia" element={<AiUsagePage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
