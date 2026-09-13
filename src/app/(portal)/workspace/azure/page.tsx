"use client";

import { InspectTenantGate } from "@/hooks/useInspectCustomer";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function Page() {
  return (
    <InspectTenantGate title="Select a customer for Azure">
      {(customerId) => <Body customerId={customerId} />}
    </InspectTenantGate>
  );
}

function Body({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<Array<{ id: string; name: string; catalog?: string; price: number }>>([]);

  useEffect(() => {
    void portalFetch(`/api/subscriptions?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then((d) => {
        const all = (d.subscriptions || []) as Array<{ id: string; name: string; catalog?: string; price: number }>;
        setRows(all.filter((s) => s.catalog === "azure" || /azure/i.test(s.name)));
      });
  }, [customerId]);

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Azure"
        subtitle="Azure is a consumption / Azure plan domain — not Microsoft 365 seat SKUs. Partner Center plan sync is Microsoft Connected (Phase 2)."
      />
      <div className="nt-card mb-4 p-4 text-sm text-nt-text-muted">
        Seat increase/decrease does not apply here. Use{" "}
        <Link href="/catalog/azure" className="nt-link">
          Azure catalog
        </Link>{" "}
        for plan SKUs until live Partner Center billing lands.
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="nt-card p-4">
            <div className="font-semibold">{r.name}</div>
            <div className="text-xs text-nt-text-muted">Consumption-linked · ${r.price.toFixed(2)}</div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="nt-card p-6 text-sm text-nt-text-muted">No Azure plans on this tenant yet.</div>
        )}
      </div>
    </div>
  );
}
