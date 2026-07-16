import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiGetMe, apiGuestLogin, apiLogin, apiRegister, apiVerifyEmail } from "@/lib/api";
import { clearToken, getToken, setToken } from "@/lib/auth";
import type { User } from "@/types";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** Registers the account and returns the email awaiting verification (no session yet). */
  register: (name: string, email: string, password: string) => Promise<string>;
  /** Confirms the emailed code; on success the user is logged in. */
  verifyEmail: (email: string, code: string) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(getToken());
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
    setUser(null);
  }, []);

  const loadUser = useCallback(
    async (jwtToken: string) => {
      setIsLoading(true);
      try {
        setTokenState(jwtToken);
        const currentUser = await apiGetMe();
        setUser(currentUser);
      } catch {
        logout();
      } finally {
        setIsLoading(false);
      }
    },
    [logout]
  );

  useEffect(() => {
    const storedToken = getToken();
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    void loadUser(storedToken);
  }, [loadUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await apiLogin(email, password);
      setToken(response.token);
      setTokenState(response.token);
      await loadUser(response.token);
    },
    [loadUser]
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const response = await apiRegister(name, email, password);
      return response.email;
    },
    []
  );

  const verifyEmail = useCallback(
    async (email: string, code: string) => {
      const response = await apiVerifyEmail(email, code);
      setToken(response.token);
      setTokenState(response.token);
      await loadUser(response.token);
    },
    [loadUser]
  );

  const continueAsGuest = useCallback(async () => {
    const response = await apiGuestLogin();
    setToken(response.token);
    setTokenState(response.token);
    await loadUser(response.token);
  }, [loadUser]);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user),
      isLoading,
      login,
      register,
      verifyEmail,
      continueAsGuest,
      logout,
    }),
    [user, token, isLoading, login, register, verifyEmail, continueAsGuest, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
