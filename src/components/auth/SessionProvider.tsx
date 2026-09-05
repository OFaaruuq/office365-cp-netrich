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
import { PORTAL_ACCOUNTS } from "@/lib/tenancy-data";
import type { PortalAccount, SessionUser } from "@/lib/tenancy-types";
import { roleHomePath } from "@/lib/tenancy-types";

interface SessionContextValue {
  user: SessionUser | null;
  ready: boolean;
  accounts: PortalAccount[];
  signIn: (accountId: string) => Promise<SessionUser>;
  signOut: () => Promise<void>;
  isPartner: boolean;
  isSupport: boolean;
  isClient: boolean;
  homePath: string;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { credentials: "include" });
        const data = await res.json();
        if (!cancelled && data.authenticated && data.user) {
          setUser(data.user as SessionUser);
        } else if (!cancelled) {
          setUser(null);
        }
        // PORTAL_LOCKED clears cookie server-side
        if (!cancelled && data.code === "PORTAL_LOCKED") {
          setUser(null);
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      accounts: PORTAL_ACCOUNTS,
      signIn,
      signOut,
      isPartner: role === "partner_admin",
      isSupport: role === "support_technical" || role === "support_billing",
      isClient: role === "customer_admin",
      homePath: role ? roleHomePath(role) : "/",
    };
  }, [user, ready, signIn, signOut]);

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
