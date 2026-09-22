import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  ApiError,
  loginRequest,
  logoutRequest,
  refreshRequest,
  registerRequest,
  type AuthPayload,
  type AuthUser,
} from "./api";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  accessToken: string | null;
  login(input: { email: string; password: string }): Promise<void>;
  logout(): Promise<void>;
  refreshSession(): Promise<string>;
  register(input: { displayName: string; email: string; password: string }): Promise<void>;
  status: AuthStatus;
  user: AuthUser | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);
let bootstrapRefresh: Promise<AuthPayload> | null = null;

function refreshSessionOnce(): Promise<AuthPayload> {
  bootstrapRefresh ??= refreshRequest().finally(() => {
    bootstrapRefresh = null;
  });
  return bootstrapRefresh;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const applyAuth = useCallback((payload: AuthPayload) => {
    setAccessToken(payload.accessToken);
    setUser(payload.user);
    setStatus("authenticated");
  }, []);

  useEffect(() => {
    let active = true;
    refreshSessionOnce()
      .then((payload) => {
        if (active) applyAuth(payload);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (!(error instanceof ApiError) || error.status !== 401) {
          console.error("Session restoration failed", error);
        }
        setAccessToken(null);
        setUser(null);
        setStatus("anonymous");
      });
    return () => {
      active = false;
    };
  }, [applyAuth]);

  const login = useCallback(async (input: { email: string; password: string }) => {
    applyAuth(await loginRequest(input));
  }, [applyAuth]);

  const register = useCallback(async (input: {
    displayName: string;
    email: string;
    password: string;
  }) => {
    applyAuth(await registerRequest(input));
  }, [applyAuth]);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setAccessToken(null);
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const payload = await refreshSessionOnce();
    applyAuth(payload);
    return payload.accessToken;
  }, [applyAuth]);

  const value = useMemo<AuthContextValue>(
    () => ({ accessToken, login, logout, refreshSession, register, status, user }),
    [accessToken, login, logout, refreshSession, register, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}
