"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PortalAccount, SessionUser } from "@/lib/tenancy-types";
import { roleHomePath } from "@/lib/tenancy-types";

interface SessionContextValue {
  user: SessionUser | null;
  ready: boolean;
  accounts: PortalAccount[];
  demoLogin: boolean;
  signIn: (accountId: string) => Promise<SessionUser>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  isPartner: boolean;
  isSupport: boolean;
  isClient: boolean;
  homePath: string;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [accounts, setAccounts] = useState<PortalAccount[]>([]);
  const [demoLogin, setDemoLogin] = useState(true);
  const [ready, setReady] = useState(false);

  const refreshSession = useCallback(async () => {
    const res = await fetch("/api/auth/session", { credentials: "include" });
    const data = await res.json();
    if (data.code === "PORTAL_LOCKED" || !data.authenticated) {
      setUser(null);
      return;
    }
    if (data.user) setUser(data.user as SessionUser);
    if (typeof data.demoLogin === "boolean") setDemoLogin(data.demoLogin);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sessionRes, personasRes] = await Promise.all([
          fetch("/api/auth/session", { credentials: "include" }),
          fetch("/api/auth/personas", { credentials: "include" }),
        ]);
        const sessionData = await sessionRes.json();
        if (!cancelled) {
          if (sessionData.code === "PORTAL_LOCKED" || !sessionData.authenticated) {
            setUser(null);
          } else if (sessionData.user) {
            setUser(sessionData.user as SessionUser);
          }
          if (typeof sessionData.demoLogin === "boolean") {
            setDemoLogin(sessionData.demoLogin);
          }
        }
        if (personasRes.ok) {
          const personas = await personasRes.json();
          if (!cancelled) {
            setAccounts(personas.accounts || []);
            if (typeof personas.demoLogin === "boolean") setDemoLogin(personas.demoLogin);
          }
        } else if (!cancelled) {
          setAccounts([]);
          setDemoLogin(false);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setAccounts([]);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-check portal lock while the portal is open (suspend converges without waiting for cookie expiry)
  useEffect(() => {
    if (!user) return;
    const tick = () => void refreshSession();
    const id = setInterval(tick, 15_000);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, refreshSession]);

  const signIn = useCallback(async (accountId: string) => {
    const res = await fetch("/api/auth/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Sign-in failed");
    }
    const session = data.user as SessionUser;
    setUser(session);
    return session;
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
    setUser(null);
  }, []);

  const value = useMemo<SessionContextValue>(() => {
    const role = user?.role;
    return {
      user,
      ready,
      accounts,
      demoLogin,
      signIn,
      signOut,
      refreshSession,
      isPartner: role === "partner_admin",
      isSupport: role === "support_technical" || role === "support_billing",
      isClient: role === "customer_admin",
      homePath: role ? roleHomePath(role) : "/",
    };
  }, [user, ready, accounts, demoLogin, signIn, signOut, refreshSession]);

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
