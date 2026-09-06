"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

type Order = {
  id: string;
  customerId: string;
  quoteId?: string;
  status: string;
  items: Array<{ name: string; qty: number; unitPrice: number }>;
  createdAt: string;
  updatedAt: string;
};

export default function Page() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});

  useEffect(() => {
    void Promise.all([
      portalFetch("/api/csp/orders").then((r) => r.json()),
      portalFetch("/api/csp/customers").then((r) => r.json()),
    ]).then(([o, c]) => {
      setOrders(o.orders || []);
      const map: Record<string, string> = {};
      for (const row of c.customers || []) map[row.id] = row.name;
      setCustomers(map);
    });
  }, []);

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Orders"
        subtitle="Order state machine — Foundation SoR. Partner Center submit is Phase 2–3."
        actions={
          <Link href="/admin/commerce/quotes" className="nt-btn-on-brand text-xs">
            Quotes
          </Link>
        }
      />
      <div className="space-y-2">
        {orders.map((o) => {
          const total = o.items.reduce((n, i) => n + i.qty * i.unitPrice, 0);
          return (
            <div key={o.id} className="nt-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{o.id}</div>
                  <div className="text-xs text-nt-text-muted">
                    {customers[o.customerId] || o.customerId}
                    {o.quoteId ? ` · quote ${o.quoteId}` : ""}
                  </div>
                </div>
                <span className="rounded-full bg-nt-surface-muted px-2 py-0.5 text-[11px] font-semibold">
                  {o.status}
                </span>
              </div>
              <ul className="mt-2 text-sm text-nt-text-muted">
                {o.items.map((i, idx) => (
                  <li key={idx}>
                    {i.name} × {i.qty} @ ${i.unitPrice.toFixed(2)}
                  </li>
                ))}
              </ul>
              <div className="mt-2 text-sm font-semibold">Total ${total.toFixed(2)}</div>
            </div>
          );
        })}
        {orders.length === 0 && (
          <div className="nt-card p-6 text-sm text-nt-text-muted">
            No orders yet. Approve a quote to seed the order pipeline.
          </div>
        )}
      </div>
    </div>
  );
}
