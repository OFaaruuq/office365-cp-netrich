"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

const KEY = "nt_view_as_customer";

export type ViewAsSession = {
  customerId: string;
  customerName?: string;
  reason: string;
  expiresAt: string;
  banner: string;
  readOnly: boolean;
};

export function storeViewAsSession(session: ViewAsSession) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
    sessionStorage.setItem(
      "nt_inspect_customer",
      JSON.stringify({ customerId: session.customerId, customerName: session.customerName || "" })
    );
    window.dispatchEvent(new Event("nt-view-as"));
    window.dispatchEvent(new Event("nt-inspect"));
  } catch {
    /* ignore */
  }
}

export function clearViewAsSession() {
  try {
    sessionStorage.removeItem(KEY);
    window.dispatchEvent(new Event("nt-view-as"));
  } catch {
    /* ignore */
  }
}

export function ViewAsCustomerBanner() {
  const [session, setSession] = useState<ViewAsSession | null>(null);

  useEffect(() => {
    function load() {
      try {
        const raw = sessionStorage.getItem(KEY);
        if (!raw) {
          setSession(null);
          return;
        }
        const parsed = JSON.parse(raw) as ViewAsSession;
        if (new Date(parsed.expiresAt).getTime() < Date.now()) {
          clearViewAsSession();
          setSession(null);
          return;
        }
        setSession(parsed);
      } catch {
        setSession(null);
      }
    }
    load();
    window.addEventListener("nt-view-as", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("nt-view-as", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  if (!session) return null;

  return (
    <div className="sticky top-[60px] z-20 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 lg:ml-0">
      <div className="mx-auto flex max-w-[1440px] items-start gap-2 sm:items-center">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700 sm:mt-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{session.banner}</div>
          <div className="text-xs text-amber-800/80">
            Reason: {session.reason}
            {session.readOnly ? " · Read-only" : ""} · Expires{" "}
            {new Date(session.expiresAt).toLocaleString()}
          </div>
        </div>
        <button
          type="button"
          onClick={() => clearViewAsSession()}
          className="rounded p-1 hover:bg-amber-100"
          aria-label="End view-as session"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
