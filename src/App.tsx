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
import { OrganizationsPage } from "@/features/organizations/OrganizationsPage";
import { OrganizationEditorPage } from "@/features/organizations/OrganizationEditorPage";
import { ProceduresPage } from "@/features/procedures/ProceduresPage";
import { ProcedureEditorPage } from "@/features/procedures/ProcedureEditorPage";
import { QuartiersPage } from "@/features/quartiers/QuartiersPage";
import { UtilisateursPage } from "@/pages/UtilisateursPage";
import { SuperAdminDashboardPage } from "@/features/superadmin/SuperAdminDashboardPage";
import { OrgSettingsPage } from "@/features/superadmin/organizations/OrgSettingsPage";
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

          {/* Super admin — separate area, separate menu, only reachable by global_role = super_admin */}
          <Route element={<SuperAdminRoute />}>
            <Route element={<SuperAdminLayout />}>
              <Route path="/superadmin" index element={<SuperAdminDashboardPage />} />
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
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="types-pieces" element={<DocumentTypesPage />} />
              <Route path="quartiers" element={<QuartiersPage />} />
              <Route path="utilisateurs" element={<UtilisateursPage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
