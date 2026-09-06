"use client";

import { useEffect, useState } from "react";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

/** Partner invoices — Foundation reconciliation view from subscription MRR. */
export default function Page() {
  const [rows, setRows] = useState<
    Array<{
      customerId: string;
      customerName: string;
      period: string;
      microsoftCost: number;
      netrichMarkup: number;
      tax: number;
      total: number;
      status: string;
    }>
  >([]);

  useEffect(() => {
    void portalFetch("/api/csp/reporting")
      .then((r) => r.json())
      .then(async (rep) => {
        const customersRes = await portalFetch("/api/csp/customers").then((x) => x.json());
        const customers = customersRes.customers || [];
        const period = new Date().toISOString().slice(0, 7);
        const invoices = customers.slice(0, 12).map(
          (c: { id: string; name: string }, i: number) => {
            const microsoftCost = Number(
              ((rep.microsoftCost || 0) / Math.max(1, customers.length)).toFixed(2)
            );
            const netrichMarkup = Number((microsoftCost * 0.18).toFixed(2));
            const tax = Number(((microsoftCost + netrichMarkup) * 0.05).toFixed(2));
            return {
              customerId: c.id,
              customerName: c.name,
              period,
              microsoftCost,
              netrichMarkup,
              tax,
              total: Number((microsoftCost + netrichMarkup + tax).toFixed(2)),
              status: i % 4 === 0 ? "open" : "paid",
            };
          }
        );
        setRows(invoices);
      });
  }, []);

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Invoices & reconciliation"
        subtitle="Microsoft cost + Netrich markup + tax → customer invoice (Foundation estimate from MRR)."
      />
      <div className="nt-card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-nt-border bg-nt-surface-muted text-[11px] uppercase text-nt-text-subtle">
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Period</th>
              <th className="px-4 py-2">MS cost</th>
              <th className="px-4 py-2">Markup</th>
              <th className="px-4 py-2">Tax</th>
              <th className="px-4 py-2">Total</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.customerId} className="border-b border-nt-border/50">
                <td className="px-4 py-2 font-medium">{r.customerName}</td>
                <td className="px-4 py-2">{r.period}</td>
                <td className="px-4 py-2">${r.microsoftCost.toFixed(2)}</td>
                <td className="px-4 py-2">${r.netrichMarkup.toFixed(2)}</td>
                <td className="px-4 py-2">${r.tax.toFixed(2)}</td>
                <td className="px-4 py-2 font-semibold">${r.total.toFixed(2)}</td>
                <td className="px-4 py-2 capitalize">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
