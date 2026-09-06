"use client";

import { useEffect, useState } from "react";
import { InspectTenantGate } from "@/hooks/useInspectCustomer";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";
import { ROLE_PACKS } from "@/lib/rbac-catalog";

type Admin = {
  id: string;
  name: string;
  email: string;
  disabled?: boolean;
  mfa?: { enrolled: boolean; enabled: boolean };
};

export default function Page() {
  return (
    <InspectTenantGate title="Select a customer for Administrators">
      {(customerId) => <Body customerId={customerId} />}
    </InspectTenantGate>
  );
}

function Body({ customerId }: { customerId: string }) {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const packs = ROLE_PACKS.filter((p) => p.scope === "customer");

  useEffect(() => {
    void portalFetch(`/api/csp/portal-admins?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then((d) => setAdmins(d.accounts || []));
  }, [customerId]);

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Administrators"
        subtitle="Customer portal admins and customer-scoped RBAC packs."
      />
      <div className="mb-4 space-y-2">
        {admins.map((a) => (
          <div key={a.id} className="nt-card flex items-center justify-between p-4">
            <div>
              <div className="font-semibold">{a.name}</div>
              <div className="text-xs text-nt-text-muted">{a.email}</div>
            </div>
            <div className="text-xs">
              {a.disabled ? (
                <span className="text-nt-danger">Disabled</span>
              ) : (
                <span className="text-nt-success">Active</span>
              )}
              {a.mfa?.enrolled ? " · MFA on" : " · MFA pending"}
            </div>
          </div>
        ))}
        {admins.length === 0 && (
          <div className="nt-card p-4 text-sm text-nt-text-muted">
            No Client Admins listed for this tenant.
          </div>
        )}
      </div>
      <div className="nt-card p-4">
        <div className="mb-2 text-sm font-semibold">Customer role packs</div>
        <ul className="space-y-2 text-sm">
          {packs.map((p) => (
            <li key={p.key}>
              <span className="font-medium">{p.name}</span>
              <div className="text-xs text-nt-text-muted">{p.permissions.join(", ")}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
