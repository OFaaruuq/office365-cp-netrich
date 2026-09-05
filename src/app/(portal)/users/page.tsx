"use client";

import Link from "next/link";
import UsersTable from "@/components/users/UsersTable";
import { useTenantWorkspace } from "@/hooks/useTenantWorkspace";

export default function UsersPage() {
  const { loading, error, workspace, needsCustomerPick } = useTenantWorkspace();

  if (loading) {
    return <div className="text-sm text-nt-text-muted">Loading tenant users…</div>;
  }

  if (needsCustomerPick) {
    return (
      <div className="nt-card max-w-lg p-6">
        <h1 className="text-lg font-semibold">Select a client tenant</h1>
        <p className="mt-2 text-sm text-nt-text-muted">
          User directories are isolated per tenant. Choose a client from Super Admin.
        </p>
        <Link href="/admin/customers" className="nt-btn-primary mt-4 inline-flex">
          Open Client Tenants
        </Link>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="rounded-xl border border-nt-danger/30 bg-nt-danger-soft px-4 py-3 text-sm text-nt-danger">
        {error || "Unable to load users"}
      </div>
    );
  }

  const total =
    workspace.userRollup.active +
    workspace.userRollup.pending +
    workspace.userRollup.blocked +
    workspace.userRollup.error;

  return (
    <UsersTable
      initialUsers={workspace.users}
      totalCount={total || workspace.users.length}
      customerId={workspace.customerId}
    />
  );
}
