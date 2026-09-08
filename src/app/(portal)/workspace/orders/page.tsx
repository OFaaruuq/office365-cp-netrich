"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";
import { useSession } from "@/components/auth/SessionProvider";

type PurchaseOrder = {
  id: string;
  productName: string;
  catalog: string;
  quantity: number;
  billingCycle: string;
  unitPrice: number;
  total: number;
  status: string;
  requestedAt: string;
  approvedAt?: string;
  paidAt?: string;
  fulfilledAt?: string;
  rejectReason?: string;
  paymentRef?: string;
  subscriptionId?: string;
};

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Awaiting approval",
  AWAITING_PAYMENT: "Payment required",
  APPROVED: "Payment required",
  PAID: "Paid",
  FULFILLED: "Licenses issued",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export default function ClientOrdersPage() {
  const { isClient, ready } = useSession();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await portalFetch("/api/commerce/orders");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to load orders");
      return;
    }
    setOrders(data.orders || []);
    setError(null);
  }, []);

  useEffect(() => {
    if (ready && isClient) void load();
  }, [ready, isClient, load]);

  async function act(id: string, action: "pay" | "cancel") {
    setBusyId(id);
    setMessage(null);
    setError(null);
    try {
      const res = await portalFetch("/api/commerce/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Action failed");
        return;
      }
      setMessage(data.message || "Updated");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (!ready) {
    return <div className="text-sm text-nt-text-muted">Loading…</div>;
  }

  if (!isClient) {
    return (
      <div className="nt-card p-6 text-sm text-nt-text-muted">
        Orders for client tenants. Partners use{" "}
        <Link href="/admin/commerce/orders" className="text-nt-purple underline">
          Commerce → Orders
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Orders"
        subtitle="Request → Super Admin approval → full payment → licenses. Browse catalogs to submit a new order."
        actions={
          <Link href="/catalog/microsoft-365" className="nt-btn-on-brand text-xs">
            Browse catalogs
          </Link>
        }
      />

      {message && (
        <div className="mb-4 rounded-lg border border-nt-success/30 bg-nt-success/10 px-4 py-3 text-sm text-nt-success">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-nt-danger/30 bg-nt-danger/10 px-4 py-3 text-sm text-nt-danger">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.id} className="nt-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{o.productName}</div>
                <div className="mt-1 text-xs text-nt-text-muted">
                  {o.catalog} · {o.quantity} seat(s) · {o.billingCycle} · {o.id}
                </div>
                <div className="mt-1 text-xs text-nt-text-subtle">
                  Requested {o.requestedAt.slice(0, 16).replace("T", " ")}
                  {o.fulfilledAt ? ` · Fulfilled ${o.fulfilledAt.slice(0, 10)}` : ""}
                </div>
                {o.rejectReason && (
                  <div className="mt-1 text-xs text-nt-danger">{o.rejectReason}</div>
                )}
                {o.paymentRef && (
                  <div className="mt-1 text-xs text-nt-text-muted">Payment ref: {o.paymentRef}</div>
                )}
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">${o.total.toFixed(2)}</div>
                <span className="mt-1 inline-block rounded-full bg-nt-surface-muted px-2 py-0.5 text-[11px] font-semibold">
                  {STATUS_LABEL[o.status] || o.status}
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(o.status === "AWAITING_PAYMENT" || o.status === "APPROVED") && (
                <button
                  type="button"
                  className="nt-btn-primary text-xs"
                  disabled={busyId === o.id}
                  onClick={() => void act(o.id, "pay")}
                >
                  {busyId === o.id ? "Processing…" : "Pay in full & get licenses"}
                </button>
              )}
              {o.status === "REQUESTED" && (
                <button
                  type="button"
                  className="nt-btn-outline text-xs"
                  disabled={busyId === o.id}
                  onClick={() => void act(o.id, "cancel")}
                >
                  Cancel request
                </button>
              )}
              {o.status === "FULFILLED" && (
                <Link href="/products" className="nt-btn-outline text-xs">
                  View subscriptions
                </Link>
              )}
            </div>
          </div>
        ))}
        {orders.length === 0 && (
          <div className="nt-card p-6 text-sm text-nt-text-muted">
            No orders yet. Open a product catalog and click <strong>Request purchase</strong>.
          </div>
        )}
      </div>
    </div>
  );
}
