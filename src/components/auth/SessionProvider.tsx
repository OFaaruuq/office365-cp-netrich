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
import type { SessionUser } from "@/lib/tenancy-types";
import { roleHomePath } from "@/lib/tenancy-types";

export type MfaChallenge = {
  step: "enroll" | "verify";
  challengeId: string;
  message?: string;
  qrDataUrl?: string;
  secret?: string;
  otpauthUrl?: string;
};

interface SessionContextValue {
  user: SessionUser | null;
  ready: boolean;
  demoLogin: boolean;
  entraConfigured: boolean;
  signIn: (accountId: string) => Promise<SessionUser | MfaChallenge>;
  signInWithCredentials: (
    email: string,
    password: string
  ) => Promise<SessionUser | MfaChallenge>;
  signInWithEntra: () => Promise<{ mode: "redirect" | "unavailable"; message?: string }>;
  completeMfa: (challengeId: string, code: string, action?: "verify" | "enroll") => Promise<SessionUser>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  isPartner: boolean;
  isSupport: boolean;
  isClient: boolean;
  homePath: string;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function isMfaChallenge(data: Record<string, unknown>): data is MfaChallenge & {
  mfaRequired: true;
} {
  return Boolean(data.mfaRequired && data.challengeId && data.step);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [demoLogin, setDemoLogin] = useState(true);
  const [ready, setReady] = useState(false);
  const entraConfigured = Boolean(
    process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID &&
      process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID !== "00000000-0000-0000-0000-000000000000"
  );

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
        const sessionRes = await fetch("/api/auth/session", { credentials: "include" });
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

  const signInWithCredentials = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Sign-in failed");
    }
    if (isMfaChallenge(data)) {
      return {
        step: data.step as "enroll" | "verify",
        challengeId: String(data.challengeId),
        message: data.message ? String(data.message) : undefined,
        qrDataUrl: data.qrDataUrl ? String(data.qrDataUrl) : undefined,
        secret: data.secret ? String(data.secret) : undefined,
        otpauthUrl: data.otpauthUrl ? String(data.otpauthUrl) : undefined,
      };
    }
    const session = data.user as SessionUser;
    setUser(session);
    return session;
  }, []);

  const completeMfa = useCallback(
    async (challengeId: string, code: string, action: "verify" | "enroll" = "verify") => {
      const res = await fetch("/api/auth/mfa", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, code, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "MFA verification failed");
      }
      const session = data.user as SessionUser;
      setUser(session);
      void fetch("/api/csp/sessions/track", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }).catch(() => undefined);
      return session;
    },
    []
  );

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
    if (isMfaChallenge(data)) {
      return {
        step: data.step as "enroll" | "verify",
        challengeId: String(data.challengeId),
        message: data.message ? String(data.message) : undefined,
        qrDataUrl: data.qrDataUrl ? String(data.qrDataUrl) : undefined,
        secret: data.secret ? String(data.secret) : undefined,
        otpauthUrl: data.otpauthUrl ? String(data.otpauthUrl) : undefined,
      };
    }
    const session = data.user as SessionUser;
    setUser(session);
    return session;
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
    setUser(null);
  }, []);

  const signInWithEntra = useCallback(async () => {
    if (!entraConfigured) {
      return {
        mode: "unavailable" as const,
        message:
          "Set NEXT_PUBLIC_AZURE_AD_CLIENT_ID to enable Microsoft Entra SSO (production identity).",
      };
    }
    const { PublicClientApplication } = await import("@azure/msal-browser");
    const { msalConfig, loginRequest } = await import("@/lib/msal-config");
    const pca = new PublicClientApplication(msalConfig);
    await pca.initialize();
    await pca.loginRedirect(loginRequest);
    return { mode: "redirect" as const };
  }, [entraConfigured]);

  const value = useMemo<SessionContextValue>(() => {
    const role = user?.role;
    return {
      user,
      ready,
      demoLogin,
      entraConfigured,
      signIn,
      signInWithCredentials,
      signInWithEntra,
      completeMfa,
      signOut,
      refreshSession,
      isPartner: role === "partner_admin",
      isSupport: role === "support_technical" || role === "support_billing",
      isClient: role === "customer_admin",
      homePath: role ? roleHomePath(role) : "/",
    };
  }, [
    user,
    ready,
    demoLogin,
    entraConfigured,
    signIn,
    signInWithCredentials,
    signInWithEntra,
    completeMfa,
    signOut,
    refreshSession,
  ]);

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
