import { Outlet } from "react-router-dom";
import { SuperAdminSidebar } from "@/components/layout/SuperAdminSidebar";

export function SuperAdminLayout() {
  return (
    <div className="flex h-screen">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
