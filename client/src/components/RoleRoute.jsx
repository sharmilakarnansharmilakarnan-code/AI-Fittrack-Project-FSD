import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// UI convenience only: the backend enforces every role rule (403) regardless.
export default function RoleRoute({ roles, children }) {
  const { user } = useAuth();
  if (!roles.includes(user?.role || "user")) return <Navigate to="/" replace />;
  return children;
}
