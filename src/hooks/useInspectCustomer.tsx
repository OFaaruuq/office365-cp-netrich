"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/auth/SessionProvider";

const VIEW_AS_KEY = "nt_view_as_customer";
const INSPECT_KEY = "nt_inspect_customer";

export type InspectTarget = {
  customerId: string;
  customerName?: string;
  source: "session" | "view-as" | "inspect" | "query";
};

function readViewAs(): { customerId: string; customerName?: string } | null {
  try {
    const raw = sessionStorage.getItem(VIEW_AS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      customerId: string;
      customerName?: string;
      expiresAt: string;
    };
    if (new Date(parsed.expiresAt).getTime() < Date.now()) return null;
    return { customerId: parsed.customerId, customerName: parsed.customerName };
  } catch {
    return null;
  }
}

function readInspect(): { customerId: string; customerName?: string } | null {
  try {
    const raw = sessionStorage.getItem(INSPECT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { customerId: string; customerName?: string };
  } catch {
    return null;
  }
}

export function setInspectCustomer(customerId: string, customerName?: string) {
  try {
    sessionStorage.setItem(
      INSPECT_KEY,
      JSON.stringify({ customerId, customerName: customerName || "" })
    );
    window.dispatchEvent(new Event("nt-inspect"));
  } catch {
    /* ignore */
  }
}

export function clearInspectCustomer() {
  try {
    sessionStorage.removeItem(INSPECT_KEY);
    window.dispatchEvent(new Event("nt-inspect"));
  } catch {
    /* ignore */
  }
}

/** Resolve which customer workspace the current user is operating on. */
export function useInspectCustomer() {
  const { user, isClient, isPartner, ready } = useSession();
  const [target, setTarget] = useState<InspectTarget | null>(() => {
    if (typeof window === "undefined") return null;
    const qs = new URLSearchParams(window.location.search).get("customerId");
    if (qs) return { customerId: qs, source: "query" };
    const viewAs = readViewAs();
    if (viewAs?.customerId) return { ...viewAs, source: "view-as" };
    const inspect = readInspect();
    if (inspect?.customerId) return { ...inspect, source: "inspect" };
    return null;
  });

  const resolve = useCallback(() => {
    if (!ready || !user) {
      setTarget(null);
      return;
    }
    if (isClient && user.customerId) {
      setTarget({
        customerId: user.customerId,
        customerName: user.customerName,
        source: "session",
      });
      return;
    }
    if (!isPartner) {
      setTarget(null);
      return;
    }
    const qs =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("customerId")
        : null;
    if (qs) {
      setTarget({ customerId: qs, source: "query" });
      return;
    }
    if (user.inspect?.customerId) {
      setTarget({
        customerId: user.inspect.customerId,
        customerName: user.inspect.customerName,
        source: "view-as",
      });
      return;
    }
    const viewAs = readViewAs();
    if (viewAs?.customerId) {
      setTarget({ ...viewAs, source: "view-as" });
      return;
    }
    const inspect = readInspect();
    if (inspect?.customerId) {
      setTarget({ ...inspect, source: "inspect" });
      return;
    }
    setTarget(null);
  }, [ready, user, isClient, isPartner]);

  useEffect(() => {
    resolve();
    window.addEventListener("nt-view-as", resolve);
    window.addEventListener("nt-inspect", resolve);
    window.addEventListener("storage", resolve);
    return () => {
      window.removeEventListener("nt-view-as", resolve);
      window.removeEventListener("nt-inspect", resolve);
      window.removeEventListener("storage", resolve);
    };
  }, [resolve]);

  return {
    ready,
    isPartner,
    isClient,
    customerId: target?.customerId || null,
    customerName: target?.customerName,
    source: target?.source,
    needsPick: Boolean(ready && isPartner && !target?.customerId),
    setInspectCustomer,
    clearInspectCustomer,
  };
}

/** Partner-only gate: pick a customer to inspect workspace pages. */
export function InspectTenantGate({
  title,
  children,
}: {
  title?: string;
  children: (customerId: string) => React.ReactNode;
}) {
  const { customerId, customerName, isPartner, source } = useInspectCustomer();
  const { user } = useSession();
  const sessionInspect = Boolean(user?.inspect?.customerId);
  const needsAuditedViewAs = Boolean(isPartner && !sessionInspect);

  if (!needsAuditedViewAs && customerId) {
    return (
      <>
        {isPartner && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-nt-text-muted">
            <span>
              Inspecting{" "}
              <strong className="text-nt-purple">{customerName || customerId}</strong>
              {source === "view-as" ? " (audited view-as)" : ""}
            </span>
            <Link href="/admin/tenants" className="nt-link">
              All customers
            </Link>
          </div>
        )}
        {children(customerId)}
      </>
    );
  }

  if (!isPartner && customerId) {
    return <>{children(customerId)}</>;
  }

  return (
    <div className="nt-fade-in">
      <div className="nt-card max-w-xl p-6">
        <h1 className="text-lg font-semibold">{title || "Start view-as-customer"}</h1>
        <p className="mt-2 text-sm text-nt-text-muted">
          Partner workspace inspect requires an audited view-as session (reason and duration) from the
          tenant profile. SessionStorage-only tenant picks are not allowed.
        </p>
        <Link href="/admin/tenants" className="nt-btn-primary mt-4 inline-flex text-xs">
          Open All Customers
        </Link>
      </div>
    </div>
  );
}
