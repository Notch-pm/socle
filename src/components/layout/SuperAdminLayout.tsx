import { Outlet } from "react-router-dom";
import { SuperAdminSidebar } from "@/components/layout/SuperAdminSidebar";

export function SuperAdminLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
