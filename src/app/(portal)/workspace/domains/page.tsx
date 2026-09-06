"use client";

import { InspectTenantGate } from "@/hooks/useInspectCustomer";
import { useEffect, useState } from "react";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

export default function Page() {
  return (
    <InspectTenantGate title="Select a customer to view domains">
      {(customerId) => <DomainsBody customerId={customerId} />}
    </InspectTenantGate>
  );
}

function DomainsBody({ customerId }: { customerId: string }) {
  const [domains, setDomains] = useState<
    Array<{
      name: string;
      verified: boolean;
      primary: boolean;
      dns: Record<string, boolean>;
    }>
  >([]);
  useEffect(() => {
    void portalFetch(`/api/csp/domains?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then((d) => setDomains(d.domains || []));
  }, [customerId]);
  return (
    <div className="nt-fade-in">
      <AdminHero title="Domains" subtitle="Verified domains and DNS health for this Microsoft tenant." />
      <div className="space-y-3">
        {domains.map((d) => (
          <div key={d.name} className="nt-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-semibold">{d.name}</div>
              {d.primary && (
                <span className="rounded-full bg-nt-purple-soft px-2 text-[10px] font-semibold text-nt-purple">
                  Primary
                </span>
              )}
              <span
                className={`rounded-full px-2 text-[10px] font-semibold ${
                  d.verified ? "bg-nt-success-soft text-nt-success" : "bg-nt-warning-soft text-nt-warning"
                }`}
              >
                {d.verified ? "Verified" : "Unverified"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              {Object.entries(d.dns).map(([k, ok]) => (
                <span key={k} className={ok ? "text-nt-success" : "text-nt-danger"}>
                  {ok ? "✓" : "✗"} {k.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        ))}
        {domains.length === 0 && (
          <div className="nt-card p-6 text-sm text-nt-text-muted">No domains for this tenant.</div>
        )}
      </div>
    </div>
  );
}
