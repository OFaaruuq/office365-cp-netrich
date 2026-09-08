"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

export default function Page() {
  const [data, setData] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    void portalFetch("/api/csp/reporting")
      .then((r) => r.json())
      .then(setData);
  }, []);
  const cards = [
    { label: "Customers", key: "customers" },
    { label: "Active tenants", key: "activeTenants" },
    { label: "Seats", key: "seats" },
    { label: "MRR", key: "mrr", money: true },
    { label: "Microsoft cost", key: "microsoftCost", money: true },
    { label: "Gross margin", key: "grossMargin", money: true },
    { label: "Renewals / 30d", key: "renewals30" },
    { label: "GDAP expiring", key: "gdapExpiring" },
    { label: "Failed syncs", key: "failedSyncs" },
  ];
  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Partner Control Center"
        subtitle="Operational analytics from live tenant subscriptions (Foundation SoR)."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/commerce/quotes" className="nt-btn-on-brand text-xs">
              Generate quote
            </Link>
            <Link href="/admin/billing/invoices" className="nt-btn-on-brand text-xs">
              Generate invoice
            </Link>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.key} className="nt-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-nt-text-subtle">
              {c.label}
            </div>
            <div className="mt-1 text-2xl font-bold text-nt-text">
              {data
                ? c.money
                  ? `$${Number(data[c.key] || 0).toLocaleString()}`
                  : Number(data[c.key] || 0).toLocaleString()
                : "…"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
