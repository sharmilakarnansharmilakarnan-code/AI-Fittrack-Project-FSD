import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Loader from "./Loader";

export default function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <Loader label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace />;

  return children;
}
