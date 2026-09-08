"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

type PurchaseOrder = {
  id: string;
  customerId: string;
  customerName: string;
  productName: string;
  catalog: string;
  quantity: number;
  billingCycle: string;
  unitPrice: number;
  total: number;
  status: string;
  requestedBy: string;
  requestedAt: string;
  approvedAt?: string;
  paidAt?: string;
  fulfilledAt?: string;
  rejectReason?: string;
  paymentRef?: string;
  subscriptionId?: string;
};

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Awaiting your approval",
  AWAITING_PAYMENT: "Approved — awaiting payment",
  APPROVED: "Approved — awaiting payment",
  PAID: "Paid",
  FULFILLED: "Licenses issued",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export default function PartnerOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [filter, setFilter] = useState<"all" | "REQUESTED" | "AWAITING_PAYMENT" | "FULFILLED">(
    "all"
  );
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
    void load();
  }, [load]);

  async function decide(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setMessage(null);
    setError(null);
    try {
      const body: Record<string, string> = { id, action };
      if (action === "reject") {
        const reason = window.prompt("Rejection reason (optional)") || "";
        if (reason) body.reason = reason;
      }
      const res = await portalFetch("/api/commerce/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  async function invoiceFromOrder(o: PurchaseOrder) {
    setBusyId(o.id);
    setMessage(null);
    setError(null);
    try {
      const res = await portalFetch("/api/csp/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: o.customerId,
          orderId: o.id,
          currency: "USD",
          notes: `Generated from purchase order ${o.id}`,
          status: "draft",
          items: [
            {
              name: o.productName,
              qty: o.quantity,
              unitPrice: o.unitPrice,
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate invoice");
        return;
      }
      setMessage(`Invoice ${data.invoice.id} drafted — open Billing → Invoices`);
    } finally {
      setBusyId(null);
    }
  }

  const visible = orders.filter((o) => {
    if (filter === "all") return true;
    if (filter === "AWAITING_PAYMENT") {
      return o.status === "AWAITING_PAYMENT" || o.status === "APPROVED";
    }
    return o.status === filter;
  });

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Purchase orders"
        subtitle="Client catalog requests. Approve to unlock payment; licenses issue only after the client pays in full."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/commerce/quotes" className="nt-btn-on-brand text-xs">
              Quotes
            </Link>
            <Link href="/admin/billing/invoices" className="nt-btn-on-brand text-xs">
              Invoices
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["REQUESTED", "Pending approval"],
            ["AWAITING_PAYMENT", "Awaiting payment"],
            ["FULFILLED", "Fulfilled"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={
              filter === id
                ? "rounded-full bg-nt-purple px-3 py-1.5 text-xs font-semibold text-white"
                : "rounded-full bg-nt-surface-muted px-3 py-1.5 text-xs font-medium text-nt-text-muted"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-nt-success/30 bg-nt-success/10 px-4 py-3 text-sm text-nt-success">
          {message}{" "}
          {message.includes("Invoice") && (
            <Link href="/admin/billing/invoices" className="underline">
              View invoices
            </Link>
          )}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-nt-danger/30 bg-nt-danger/10 px-4 py-3 text-sm text-nt-danger">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {visible.map((o) => (
          <div key={o.id} className="nt-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{o.productName}</div>
                <div className="mt-1 text-xs text-nt-text-muted">
                  {o.customerName} · {o.catalog} · {o.quantity} × ${o.unitPrice.toFixed(2)} ·{" "}
                  {o.billingCycle}
                </div>
                <div className="mt-1 text-xs text-nt-text-subtle">
                  {o.id} · by {o.requestedBy} · {o.requestedAt.slice(0, 16).replace("T", " ")}
                </div>
                {o.subscriptionId && (
                  <div className="mt-1 text-xs text-nt-success">
                    Subscription {o.subscriptionId}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">${o.total.toFixed(2)}</div>
                <span className="mt-1 inline-block rounded-full bg-nt-surface-muted px-2 py-0.5 text-[11px] font-semibold">
                  {STATUS_LABEL[o.status] || o.status}
                </span>
              </div>
            </div>
            {o.status === "REQUESTED" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="nt-btn-primary text-xs"
                  disabled={busyId === o.id}
                  onClick={() => void decide(o.id, "approve")}
                >
                  {busyId === o.id ? "Working…" : "Approve (await payment)"}
                </button>
                <button
                  type="button"
                  className="nt-btn-outline text-xs"
                  disabled={busyId === o.id}
                  onClick={() => void decide(o.id, "reject")}
                >
                  Reject
                </button>
              </div>
            )}
            {(o.status === "AWAITING_PAYMENT" ||
              o.status === "APPROVED" ||
              o.status === "PAID" ||
              o.status === "FULFILLED") && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="nt-btn-outline text-xs"
                  disabled={busyId === o.id}
                  onClick={() => void invoiceFromOrder(o)}
                >
                  Generate invoice
                </button>
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && (
          <div className="nt-card p-6 text-sm text-nt-text-muted">
            No purchase orders in this filter. Clients submit requests from product catalogs.
          </div>
        )}
      </div>
    </div>
  );
}
