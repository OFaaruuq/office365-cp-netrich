"use client";

import { useEffect, useState } from "react";
import { InspectTenantGate } from "@/hooks/useInspectCustomer";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";
import { useSession } from "@/components/auth/SessionProvider";

export default function Page() {
  const { isPartner } = useSession();
  if (isPartner) {
    return (
      <InspectTenantGate title="Select a customer for Audit Log">
        {(customerId) => <Body customerId={customerId} />}
      </InspectTenantGate>
    );
  }
  return <Body />;
}

function Body({ customerId }: { customerId?: string }) {
  const [events, setEvents] = useState<
    Array<{ id: string; at: string; action: string; actorEmail: string; detail?: string }>
  >([]);

  useEffect(() => {
    const qs = customerId ? `?customerId=${encodeURIComponent(customerId)}` : "";
    void portalFetch(`/api/csp/audit${qs}`)
      .then((r) => r.json())
      .then((d) => setEvents(d.events || []));
  }, [customerId]);

  return (
    <div className="nt-fade-in">
      <AdminHero title="Audit log" subtitle="Tenant-scoped compliance events." />
      <div className="nt-card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-nt-border bg-nt-surface-muted text-[11px] uppercase text-nt-text-subtle">
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Actor</th>
              <th className="px-4 py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b border-nt-border/50">
                <td className="px-4 py-2 text-xs text-nt-text-muted">
                  {new Date(e.at).toLocaleString()}
                </td>
                <td className="px-4 py-2 font-medium">{e.action}</td>
                <td className="px-4 py-2 text-xs">{e.actorEmail}</td>
                <td className="px-4 py-2 text-xs text-nt-text-muted">{e.detail || "—"}</td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-nt-text-muted">
                  No events.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
