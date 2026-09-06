"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

export default function Page() {
  const [summary, setSummary] = useState({ d30: 0, d60: 0, d90: 0 });
  const [rows, setRows] = useState<
    Array<{ customerId: string; customerName: string; product: string; renewal: string; seats: number }>
  >([]);
  useEffect(() => {
    void portalFetch("/api/csp/renewals?days=90")
      .then((r) => r.json())
      .then((d) => {
        setSummary(d.summary || { d30: 0, d60: 0, d90: 0 });
        setRows(d.renewals || []);
      });
  }, []);
  return (
    <div className="nt-fade-in">
      <AdminHero title="Renewals" subtitle="Upcoming subscription renewals across all customers." />
      <div className="mb-4 grid grid-cols-3 gap-3">
        {[
          ["Next 30 days", summary.d30],
          ["Next 60 days", summary.d60],
          ["Next 90 days", summary.d90],
        ].map(([label, val]) => (
          <div key={String(label)} className="nt-card p-4 text-center">
            <div className="text-xs text-nt-text-muted">{label}</div>
            <div className="text-2xl font-bold">{val}</div>
          </div>
        ))}
      </div>
      <div className="nt-card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-nt-border text-[11px] uppercase text-nt-text-subtle">
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Renewal</th>
              <th className="px-4 py-2">Seats</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-nt-border/60">
                <td className="px-4 py-2">
                  <Link href={`/admin/tenants/${r.customerId}`} className="text-nt-purple hover:underline">
                    {r.customerName}
                  </Link>
                </td>
                <td className="px-4 py-2">{r.product}</td>
                <td className="px-4 py-2">{r.renewal.slice(0, 10)}</td>
                <td className="px-4 py-2">{r.seats}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-nt-text-muted">
                  No renewals in the next 90 days.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
