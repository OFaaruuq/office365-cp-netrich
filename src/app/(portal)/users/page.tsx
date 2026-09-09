"use client";

import UsersTable from "@/components/users/UsersTable";
import { InspectTenantGate } from "@/hooks/useInspectCustomer";
import { useSession } from "@/components/auth/SessionProvider";
import { useEffect, useState } from "react";
import { portalFetch } from "@/lib/admin-api";
import type { PortalUser } from "@/lib/types";

export default function UsersPage() {
  return (
    <InspectTenantGate title="Select a client tenant for Users">
      {(customerId) => <UsersBody customerId={customerId} />}
    </InspectTenantGate>
  );
}

function UsersBody({ customerId }: { customerId: string }) {
  const { isPartner } = useSession();
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void portalFetch(`/api/users?customerId=${encodeURIComponent(customerId)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed");
        setUsers(d.users || []);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) return <div className="text-sm text-nt-text-muted">Loading tenant users…</div>;
  if (error) {
    return (
      <div className="rounded-xl border border-nt-danger/30 bg-nt-danger-soft px-4 py-3 text-sm text-nt-danger">
        {error}
      </div>
    );
  }

  return (
    <UsersTable
      initialUsers={users}
      totalCount={users.length}
      customerId={customerId}
      readOnly={isPartner}
    />
  );
}
