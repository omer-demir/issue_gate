"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi } from "@/lib/api";

const STORAGE_KEY = "igw.session.v1";

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  email: string;
}

interface SessionContextValue {
  accessToken: string | null;
  email: string | null;
  isAuthenticated: boolean;
  register: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSession(readStoredSession());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: StoredSession | null) => {
    setSession(next);
    if (typeof window === "undefined") return;
    if (next) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const register = useCallback(
    async (email: string, password: string) => {
      await authApi.register(email, password);
      const tokens = await authApi.login(email, password);
      persist({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, email });
    },
    [persist]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await authApi.login(email, password);
      persist({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, email });
    },
    [persist]
  );

  const logout = useCallback(async () => {
    if (session) {
      await authApi.logout(session.refreshToken).catch(() => undefined);
    }
    persist(null);
  }, [session, persist]);

  const value = useMemo<SessionContextValue>(
    () => ({
      accessToken: session?.accessToken ?? null,
      email: session?.email ?? null,
      isAuthenticated: Boolean(session?.accessToken),
      register,
      login,
      logout,
    }),
    [session, register, login, logout]
  );

  if (!hydrated) return null;

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}
