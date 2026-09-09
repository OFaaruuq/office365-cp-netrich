"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useSession } from "@/components/auth/SessionProvider";
import { portalFetch } from "@/lib/admin-api";
import { clearInspectCustomer } from "@/hooks/useInspectCustomer";

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
  const { user, isPartner, refreshSession } = useSession();
  const [ending, setEnding] = useState(false);
  const inspect = isPartner ? user?.inspect : undefined;

  useEffect(() => {
    if (inspect) {
      storeViewAsSession({
        customerId: inspect.customerId,
        customerName: inspect.customerName,
        reason: inspect.reason,
        expiresAt: inspect.expiresAt,
        readOnly: inspect.readOnly,
        banner: `Viewing ${inspect.customerName || inspect.customerId} as Partner Administrator (read-only)`,
      });
    }
  }, [inspect]);

  if (!inspect) return null;

  async function endViewAs() {
    setEnding(true);
    try {
      await portalFetch("/api/csp/admin-access/end", { method: "POST", body: "{}" });
      clearViewAsSession();
      clearInspectCustomer();
      await refreshSession();
    } finally {
      setEnding(false);
    }
  }

  return (
    <div className="sticky top-[60px] z-20 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 lg:ml-0">
      <div className="mx-auto flex max-w-[1440px] items-start gap-2 sm:items-center">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700 sm:mt-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            Viewing {inspect.customerName || inspect.customerId} as Partner Administrator
            {inspect.readOnly ? " (read-only)" : ""}
          </div>
          <div className="text-xs text-amber-800/80">
            Reason: {inspect.reason} · Expires {new Date(inspect.expiresAt).toLocaleString()}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void endViewAs()}
          disabled={ending}
          className="rounded p-1 hover:bg-amber-100 disabled:opacity-50"
          aria-label="End view-as session"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
