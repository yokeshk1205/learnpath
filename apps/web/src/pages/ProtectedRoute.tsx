import { LoaderCircle } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f5f5ef] text-[#496158]">
        <div className="flex items-center gap-3 text-sm font-semibold"><LoaderCircle className="size-5 animate-spin" /> Restoring secure session</div>
      </div>
    );
  }

  if (status === "anonymous") {
    return <Navigate replace state={{ from: location.pathname }} to="/login" />;
  }

  return <Outlet />;
}

