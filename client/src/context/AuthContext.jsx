import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authApi } from "../api/endpoints";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // On first load, if a token exists, verify it against /auth/profile
  useEffect(() => {
    const token = localStorage.getItem("fittrack_token");
    if (!token) {
      setIsLoading(false);
      return;
    }

    authApi
      .profile()
      .then((res) => setUser(res.data.data.user))
      .catch(() => {
        localStorage.removeItem("fittrack_token");
        localStorage.removeItem("fittrack_user");
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await authApi.login({ email, password });
    const { user: loggedInUser, token } = res.data.data;
    localStorage.setItem("fittrack_token", token);
    localStorage.setItem("fittrack_user", JSON.stringify(loggedInUser));
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const res = await authApi.register({ name, email, password });
    const { user: newUser, token } = res.data.data;
    localStorage.setItem("fittrack_token", token);
    localStorage.setItem("fittrack_user", JSON.stringify(newUser));
    setUser(newUser);
    return newUser;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("fittrack_token");
    localStorage.removeItem("fittrack_user");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
