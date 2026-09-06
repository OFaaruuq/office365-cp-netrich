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
    Array<{ id: string; name: string; type: string; members: number }>
  >([]);

  useEffect(() => {
    void portalFetch(`/api/users?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then((d) => {
        const n = (d.users || []).length;
        setGroups([
          { id: "g-all", name: "All Users", type: "Security", members: n },
          {
            id: "g-admins",
            name: "Global Administrators",
            type: "DirectoryRole",
            members: Math.min(3, n),
          },
          {
            id: "g-m365",
            name: "Microsoft 365 Licensed",
            type: "Dynamic",
            members: Math.max(1, n - 1),
          },
        ]);
      });
  }, [customerId]);

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Groups"
        subtitle="Directory and security groups (Foundation derived; Graph sync in Phase 2)."
      />
      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.id} className="nt-card flex items-center justify-between p-4">
            <div>
              <div className="font-semibold">{g.name}</div>
              <div className="text-xs text-nt-text-muted">{g.type}</div>
            </div>
            <div className="text-sm text-nt-text-muted">{g.members} members</div>
          </div>
        ))}
      </div>
    </div>
  );
}
