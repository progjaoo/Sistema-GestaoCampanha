import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

const TOKEN_KEY = "ea2026_access_token";

export type AuthUser = {
  id: number;
  email: string;
  fullName: string;
  role: string;
  regionId: number | null;
  cityId: number | null;
  leadershipId: number | null;
  isActive: boolean;
  canCreateLeaderUsers: boolean;
  phone: string | null;
  permissions: string[];
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
  updateUser: (user: AuthUser) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

setAuthTokenGetter(() =>
  typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY),
);

export function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY);
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "Não foi possível concluir a operação.");
  }
  return body;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadCurrentUser = useCallback(async () => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        window.localStorage.removeItem(TOKEN_KEY);
        setUser(null);
      } else {
        const body = (await response.json()) as { user: AuthUser };
        setUser(body.user);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCurrentUser();
  }, [loadCurrentUser]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await parseResponse(response) as { token: string; user: AuthUser };
    window.localStorage.setItem(TOKEN_KEY, body.token);
    setUser(body.user);
  }, []);

  const logout = useCallback(async () => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }).catch(() => undefined);
    window.localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    isAuthenticated: Boolean(user),
    login,
    logout,
    can: (permission: string) => Boolean(user?.permissions.includes(permission)),
    updateUser: (nextUser: AuthUser) => setUser(nextUser),
  }), [isLoading, login, logout, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}