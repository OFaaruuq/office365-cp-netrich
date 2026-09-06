"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

type Row = {
  customerId: string;
  customerName: string;
  id: string;
  name: string;
  purchased: number;
  used: number;
  billingCycle: string;
  nextRenewal: string;
  price: number;
};

export default function Page() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    void portalFetch("/api/csp/subscriptions")
      .then((r) => r.json())
      .then((d) => setRows(d.subscriptions || []));
  }, []);

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Subscriptions"
        subtitle="Cross-tenant subscription inventory from the commerce store."
        actions={
          <Link href="/admin/commerce/renewals" className="nt-btn-on-brand text-xs">
            Renewals
          </Link>
        }
      />
      <div className="nt-card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-nt-border bg-nt-surface-muted text-[11px] uppercase text-nt-text-subtle">
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Seats</th>
              <th className="px-4 py-2">Cycle</th>
              <th className="px-4 py-2">Renewal</th>
              <th className="px-4 py-2">Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-nt-border/50">
                <td className="px-4 py-2 font-medium">{r.customerName}</td>
                <td className="px-4 py-2">{r.name}</td>
                <td className="px-4 py-2">
                  {r.used}/{r.purchased}
                </td>
                <td className="px-4 py-2">{r.billingCycle}</td>
                <td className="px-4 py-2 text-xs">{r.nextRenewal?.slice?.(0, 10)}</td>
                <td className="px-4 py-2">${Number(r.price || 0).toFixed(2)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-nt-text-muted">
                  No subscriptions across tenants.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
