import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider } from "./auth/AuthProvider";
import ProtectedRoute from "./auth/ProtectedRoute";

import TeamLeaderLogin from "./pages/TeamLeaderLogin";
import AdminLogin from "./pages/AdminLogin";
import Attendance from "./pages/Attendance";
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<TeamLeaderLogin />} />

        <Route path="/admin-login" element={<AdminLogin />} />

        <Route element={<ProtectedRoute role="teamleader" />}>
          <Route path="/attendance" element={<Attendance />} />
        </Route>

        <Route element={<ProtectedRoute role="admin" />}>
          <Route
            path="/admin"
            element={
              <Suspense fallback={<div className="p-6 text-center">Loading dashboard…</div>}>
                <AdminDashboard />
              </Suspense>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
