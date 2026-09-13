"use client";

import { MsalProvider } from "@azure/msal-react";
import { PublicClientApplication, EventType, type AuthenticationResult } from "@azure/msal-browser";
import { useEffect, useState } from "react";
import { msalConfig } from "@/lib/msal-config";

let msalInstance: PublicClientApplication | null = null;

export function getMsalInstance() {
  if (typeof window === "undefined") return null;
  if (!msalInstance) {
    msalInstance = new PublicClientApplication(msalConfig);
  }
  return msalInstance;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [instance, setInstance] = useState<PublicClientApplication | null>(null);

  useEffect(() => {
    const pca = getMsalInstance();
    if (!pca) return;

    pca
      .initialize()
      .then(async () => {
        try {
          const redirect = await pca.handleRedirectPromise();
          if (redirect?.account) {
            pca.setActiveAccount(redirect.account);
            const minted = await fetch("/api/auth/entra", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                accessToken: redirect.accessToken,
                idToken: redirect.idToken,
              }),
            });
            const data = (await minted.json().catch(() => ({}))) as { user?: { role?: string } };
            const role = data.user?.role;
            const home =
              role === "partner_admin"
                ? "/admin"
                : role === "support_technical" || role === "support_billing"
                  ? "/support"
                  : "/dashboard";
            window.location.replace(home);
            return;
          }
        } catch {
          /* redirect hash may already be consumed */
        }

        const accounts = pca.getAllAccounts();
        if (accounts.length > 0) {
          pca.setActiveAccount(accounts[0]);
        }

        pca.addEventCallback((event) => {
          if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
            const result = event.payload as AuthenticationResult;
            pca.setActiveAccount(result.account);
          }
        });

        setInstance(pca);
        setReady(true);
      })
      .catch(() => {
        setReady(true);
      });
  }, []);

  if (!ready || !instance) {
    return <>{children}</>;
  }

  return <MsalProvider instance={instance}>{children}</MsalProvider>;
}
