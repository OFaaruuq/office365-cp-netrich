"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/auth/SessionProvider";
import { portalFetch } from "@/lib/admin-api";

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
  const { customerId, customerName, needsPick, isPartner, setInspectCustomer, clearInspectCustomer } =
    useInspectCustomer();
  const [rows, setRows] = useState<Array<{ id: string; name: string; domain: string; status: string }>>(
    []
  );

  useEffect(() => {
    if (!needsPick) return;
    void portalFetch("/api/csp/customers")
      .then((r) => r.json())
      .then((d) => setRows(d.customers || []));
  }, [needsPick]);

  if (!needsPick && customerId) {
    return (
      <>
        {isPartner && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-nt-text-muted">
            <span>
              Inspecting{" "}
              <strong className="text-nt-purple">{customerName || customerId}</strong>
            </span>
            <button
              type="button"
              className="font-semibold text-nt-purple underline"
              onClick={() => clearInspectCustomer()}
            >
              Change tenant
            </button>
            <Link href="/admin/tenants" className="nt-link">
              All customers
            </Link>
          </div>
        )}
        {children(customerId)}
      </>
    );
  }

  if (!needsPick) return null;

  return (
    <div className="nt-fade-in">
      <div className="nt-card max-w-xl p-6">
        <h1 className="text-lg font-semibold">{title || "Select a customer to inspect"}</h1>
        <p className="mt-2 text-sm text-nt-text-muted">
          Partner Inspect workspace is tenant-isolated. Choose a customer, or start View-as from the
          tenant profile.
        </p>
        <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto">
          {rows.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="nt-card flex w-full items-center justify-between p-3 text-left hover:border-nt-purple"
                onClick={() => setInspectCustomer(c.id, c.name)}
              >
                <span>
                  <span className="font-semibold">{c.name}</span>
                  <span className="block text-xs text-nt-text-muted">{c.domain}</span>
                </span>
                <span className="text-[11px] uppercase text-nt-text-subtle">{c.status}</span>
              </button>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="text-sm text-nt-text-muted">No customers yet. Create one under All Customers.</li>
          )}
        </ul>
        <Link href="/admin/tenants" className="nt-btn-outline mt-4 inline-flex text-xs">
          Open All Customers
        </Link>
      </div>
    </div>
  );
}
