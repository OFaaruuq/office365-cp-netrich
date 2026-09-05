"use client";

import { MsalProvider } from "@azure/msal-react";
import { PublicClientApplication, EventType, type AuthenticationResult } from "@azure/msal-browser";
import { useEffect, useState } from "react";
import { msalConfig } from "@/lib/msal-config";

let msalInstance: PublicClientApplication | null = null;

function getMsalInstance() {
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
      .then(() => {
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
