"use client";

import { useEffect, useState } from "react";
import { InspectTenantGate } from "@/hooks/useInspectCustomer";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

export default function Page() {
  return (
    <InspectTenantGate title="Select a customer for billing">
      {(customerId) => <Body customerId={customerId} />}
    </InspectTenantGate>
  );
}

function Body({ customerId }: { customerId: string }) {
  const [cost, setCost] = useState<{ monthly: number; yearly: number; triennially?: number; triennial?: number } | null>(
    null
  );
  const [subs, setSubs] = useState<Array<{ name: string; price: number; billingCycle: string }>>([]);
  useEffect(() => {
    void portalFetch(`/api/csp/billing/overview?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then((d) => {
        setCost(d.cost || null);
        setSubs(d.subscriptions || []);
      });
  }, [customerId]);
  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Billing"
        subtitle="Cost overview from subscriptions for the inspected tenant."
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {[
          ["Monthly", cost?.monthly],
          ["Yearly", cost?.yearly],
          ["Triennial", cost?.triennial ?? cost?.triennially],
        ].map(([label, val]) => (
          <div key={String(label)} className="nt-card p-4">
            <div className="text-xs text-nt-text-muted">{label}</div>
            <div className="text-xl font-bold">${Number(val || 0).toFixed(2)}</div>
          </div>
        ))}
      </div>
      <div className="nt-card p-4">
        <div className="mb-2 text-sm font-semibold">Active subscriptions</div>
        <ul className="space-y-2 text-sm">
          {subs.map((s, i) => (
            <li key={i} className="flex justify-between border-b border-nt-border/50 py-2">
              <span>{s.name}</span>
              <span className="text-nt-text-muted">
                {s.billingCycle} · ${Number(s.price || 0).toFixed(2)}
              </span>
            </li>
          ))}
          {subs.length === 0 && <li className="text-nt-text-muted">No subscriptions.</li>}
        </ul>
      </div>
    </div>
  );
}
