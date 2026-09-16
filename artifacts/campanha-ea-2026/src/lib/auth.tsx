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
const USER_KEY = "ea2026_auth_user";

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY) ?? window.sessionStorage.getItem(TOKEN_KEY);
}

function storeToken(token: string, rememberMe: boolean) {
  window.localStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);
  (rememberMe ? window.localStorage : window.sessionStorage).setItem(TOKEN_KEY, token);
}

function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY) ?? window.sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function storeUser(user: AuthUser, rememberMe: boolean) {
  window.localStorage.removeItem(USER_KEY);
  window.sessionStorage.removeItem(USER_KEY);
  (rememberMe ? window.localStorage : window.sessionStorage).setItem(USER_KEY, JSON.stringify(user));
}

function removeStoredToken() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.sessionStorage.removeItem(USER_KEY);
}

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
  login: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
  updateUser: (user: AuthUser) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

setAuthTokenGetter(() =>
  getStoredToken(),
);

export function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = getStoredToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" && typeof navigator !== "undefined" && !navigator.onLine) {
    return Promise.reject(new Error("Esta ação precisa de conexão. Tente novamente quando a internet voltar."));
  }
  return fetch(input, { ...init, headers }).then((response) => {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("online"));
    return response;
  }).catch((reason) => {
    if (typeof window !== "undefined" && (typeof navigator === "undefined" || !navigator.onLine || reason instanceof TypeError)) {
      window.dispatchEvent(new Event("offline"));
    }
    throw reason;
  });
}

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    if (response.status === 401) throw new Error("E-mail ou senha incorretos. Confira os dados e tente novamente.");
    if (response.status === 403) throw new Error("Seu acesso está bloqueado ou não está autorizado.");
    if (response.status === 429) throw new Error("Muitas tentativas de acesso. Aguarde um pouco e tente novamente.");
    throw new Error(typeof body.error === "string" ? body.error : "Não foi possível concluir a operação.");
  }
  return body;
}

function networkError(reason: unknown, fallback: string) {
  if (reason instanceof TypeError || (reason instanceof Error && /failed to fetch|network|fetch/i.test(reason.message))) {
    return new Error("Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.");
  }
  return reason instanceof Error ? reason : new Error(fallback);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadCurrentUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        removeStoredToken();
        setUser(null);
      } else {
        const body = (await response.json()) as { user: AuthUser };
        storeUser(body.user, Boolean(window.localStorage.getItem(TOKEN_KEY)));
        setUser(body.user);
      }
    } catch {
      const storedUser = getStoredUser();
      if (storedUser) setUser(storedUser);
      else setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCurrentUser();
  }, [loadCurrentUser]);

  const login = useCallback(async (email: string, password: string, rememberMe: boolean) => {
    let response: Response;
    try {
      response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe }),
      });
    } catch (reason) {
      throw networkError(reason, "Não foi possível entrar.");
    }
    const body = await parseResponse(response) as { token: string; user: AuthUser };
    storeToken(body.token, rememberMe);
    storeUser(body.user, rememberMe);
    setUser(body.user);
  }, []);

  const logout = useCallback(async () => {
    const token = getStoredToken();
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }).catch(() => undefined);
    removeStoredToken();
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