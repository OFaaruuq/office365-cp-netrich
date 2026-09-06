"use client";

import { useEffect, useState } from "react";
import { InspectTenantGate } from "@/hooks/useInspectCustomer";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

export default function Page() {
  return (
    <InspectTenantGate title="Select a customer for Renewals">
      {(customerId) => <Body customerId={customerId} />}
    </InspectTenantGate>
  );
}

function Body({ customerId }: { customerId: string }) {
  const [renewals, setRenewals] = useState<
    Array<{ product: string; renewal: string; seats: number }>
  >([]);

  useEffect(() => {
    void portalFetch(`/api/csp/renewals?days=180&customerId=${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then((d) => {
        const rows = (d.renewals || []).filter(
          (x: { customerId: string }) => x.customerId === customerId
        );
        setRenewals(rows);
      });
  }, [customerId]);

  return (
    <div className="nt-fade-in">
      <AdminHero title="Renewals" subtitle="Upcoming subscription renewals for this tenant." />
      <div className="space-y-2">
        {renewals.map((r, i) => (
          <div key={i} className="nt-card flex justify-between p-4 text-sm">
            <div>
              <div className="font-semibold">{r.product}</div>
              <div className="text-xs text-nt-text-muted">{r.seats} seats</div>
            </div>
            <div className="text-nt-text-muted">{r.renewal?.slice?.(0, 10)}</div>
          </div>
        ))}
        {renewals.length === 0 && (
          <div className="nt-card p-6 text-sm text-nt-text-muted">
            No renewals in the next 180 days.
          </div>
        )}
      </div>
    </div>
  );
}
