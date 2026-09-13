"use client";

import { useEffect, useState } from "react";
import { InspectTenantGate } from "@/hooks/useInspectCustomer";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

export default function Page() {
  return (
    <InspectTenantGate title="Select a customer for Groups">
      {(customerId) => <Body customerId={customerId} />}
    </InspectTenantGate>
  );
}

function Body({ customerId }: { customerId: string }) {
  const [groups, setGroups] = useState<
    Array<{ id: string; name: string; type: string; members: number; source?: string }>
  >([]);
  const [source, setSource] = useState("local-directory");

  useEffect(() => {
    void portalFetch(`/api/csp/groups?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then((d) => {
        setGroups(d.groups || []);
        setSource(d.source || "local-directory");
      });
  }, [customerId]);

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Groups"
        subtitle={
          source === "graph"
            ? "Microsoft Graph groups for this tenant."
            : "Derived from this tenant’s directory (license assignment groups). Graph groups appear after a successful directory sync."
        }
      />
      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.id} className="nt-card flex items-center justify-between p-4">
            <div>
              <div className="font-semibold">{g.name}</div>
              <div className="text-xs text-nt-text-muted">
                {g.type}
                {g.source ? ` · ${g.source}` : ""}
              </div>
            </div>
            <div className="text-sm text-nt-text-muted">{g.members} members</div>
          </div>
        ))}
        {groups.length === 0 && (
          <div className="nt-card p-6 text-sm text-nt-text-muted">No groups for this tenant yet.</div>
        )}
      </div>
    </div>
  );
}
