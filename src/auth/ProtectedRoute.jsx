
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export default function ProtectedRoute({ role }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10 text-sm font-medium text-slate-600">
        Loading secure workspace…
      </div>
    );
  }

  const actualRole = String(profile?.role || "")
    .trim()
    .toLowerCase();

  const requiredRole = String(role || "")
    .trim()
    .toLowerCase();

  const status = String(profile?.status || "")
    .trim()
    .toLowerCase();

  if (!user || !profile || actualRole !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  if (
    (requiredRole === "admin" && status !== "active") ||
    (requiredRole === "teamleader" && status !== "active")
  ) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
