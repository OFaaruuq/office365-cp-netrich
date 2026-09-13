"use client";

import { InspectTenantGate } from "@/hooks/useInspectCustomer";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";
import { useEffect, useState } from "react";

export default function Page() {
  return (
    <InspectTenantGate title="Select a customer for Licenses">
      {(customerId) => <Body customerId={customerId} />}
    </InspectTenantGate>
  );
}

function Body({ customerId }: { customerId: string }) {
  const [data, setData] = useState<{
    subscriptions?: Array<{ id: string; name: string; purchased: number; used: number; available?: number }>;
    assignedByUser?: Array<{ id: string; email: string; displayName: string; licenses: string[] }>;
    totals?: { purchased: number; used: number; assigned: number };
    source?: string;
  } | null>(null);

  useEffect(() => {
    void portalFetch(`/api/csp/licenses?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then(setData);
  }, [customerId]);

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Licenses"
        subtitle="Seat assignments for this tenant. Live Graph subscribedSkus when Microsoft Connected is configured."
      />
      <div className="mb-4 text-xs text-nt-text-muted">
        Purchased {data?.totals?.purchased ?? 0} · Used {data?.totals?.used ?? 0} · Assigned{" "}
        {data?.totals?.assigned ?? 0} · source {data?.source || "local"}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(data?.subscriptions || []).map((s) => (
          <div key={s.id} className="nt-card p-4">
            <div className="font-semibold">{s.name}</div>
            <div className="mt-1 text-sm text-nt-text-muted">
              {s.used} used / {s.purchased} purchased
            </div>
          </div>
        ))}
      </div>
      <h2 className="mt-8 mb-3 text-sm font-semibold">Assignments</h2>
      <div className="space-y-2">
        {(data?.assignedByUser || []).map((u) => (
          <div key={u.id} className="nt-card flex items-center justify-between p-3 text-sm">
            <div>
              <div className="font-medium">{u.displayName}</div>
              <div className="text-xs text-nt-text-muted">{u.email}</div>
            </div>
            <div className="text-xs text-nt-text-muted">{(u.licenses || []).join(", ") || "None"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
