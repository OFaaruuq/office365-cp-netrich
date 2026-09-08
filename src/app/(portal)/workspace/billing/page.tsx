"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InspectTenantGate } from "@/hooks/useInspectCustomer";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";
import { useSession } from "@/components/auth/SessionProvider";

type Invoice = {
  id: string;
  period: string;
  total: number;
  status: string;
  dueAt?: string;
  currency?: string;
  items?: Array<{ name: string; qty: number; unitPrice: number }>;
};

export default function Page() {
  return (
    <InspectTenantGate title="Select a customer for billing">
      {(customerId) => <Body customerId={customerId} />}
    </InspectTenantGate>
  );
}

function Body({ customerId }: { customerId: string }) {
  const { isPartner } = useSession();
  const [cost, setCost] = useState<{
    monthly: number;
    yearly: number;
    triennially?: number;
    triennial?: number;
  } | null>(null);
  const [subs, setSubs] = useState<Array<{ name: string; price: number; billingCycle: string }>>(
    []
  );
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    void portalFetch(`/api/csp/billing/overview?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then((d) => {
        setCost(d.cost || null);
        setSubs(d.subscriptions || []);
        setInvoices(d.invoices || []);
      });
  }, [customerId]);

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Billing"
        subtitle="Cost overview, subscriptions, and invoices for this tenant."
        badge={isPartner ? "Super Admin" : "Client"}
        actions={
          isPartner ? (
            <Link href="/admin/billing/invoices" className="nt-btn-on-brand text-xs">
              Generate invoice
            </Link>
          ) : undefined
        }
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
      <div className="mb-4 nt-card p-4">
        <div className="mb-2 text-sm font-semibold">Invoices</div>
        <ul className="space-y-2 text-sm">
          {invoices.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-nt-border/50 py-2"
            >
              <div>
                <div className="font-medium">{inv.id}</div>
                <div className="text-xs text-nt-text-muted">
                  {inv.period}
                  {inv.dueAt ? ` · due ${inv.dueAt}` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">
                  ${Number(inv.total || 0).toFixed(2)} {inv.currency || "USD"}
                </div>
                <div className="text-xs capitalize text-nt-text-muted">{inv.status}</div>
              </div>
            </li>
          ))}
          {invoices.length === 0 && (
            <li className="text-nt-text-muted">No invoices yet for this tenant.</li>
          )}
        </ul>
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
