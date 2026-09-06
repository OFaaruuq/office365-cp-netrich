"use client";

import { useEffect, useState } from "react";
import { InspectTenantGate } from "@/hooks/useInspectCustomer";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

export default function Page() {
  return (
    <InspectTenantGate title="Select a customer for service health">
      {(customerId) => <Body customerId={customerId} />}
    </InspectTenantGate>
  );
}

function Body({ customerId }: { customerId: string }) {
  const [services, setServices] = useState<Array<{ service: string; status: string; detail?: string }>>(
    []
  );
  useEffect(() => {
    void portalFetch(`/api/csp/service-health?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then((d) => setServices(d.services || []));
  }, [customerId]);
  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Microsoft 365 Health"
        subtitle="Service status for this tenant (Foundation seed; Graph health in Phase 2)."
      />
      <div className="space-y-2">
        {services.map((s) => (
          <div key={s.service} className="nt-card flex items-center justify-between p-4">
            <div>
              <div className="font-semibold">{s.service}</div>
              {s.detail && <div className="text-xs text-nt-text-muted">{s.detail}</div>}
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                s.status === "Healthy"
                  ? "bg-nt-success-soft text-nt-success"
                  : s.status === "Advisory"
                    ? "bg-nt-warning-soft text-nt-warning"
                    : "bg-nt-danger-soft text-nt-danger"
              }`}
            >
              {s.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
