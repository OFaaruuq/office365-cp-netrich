"use client";

import Link from "next/link";
import ProductCard from "@/components/products/ProductCard";
import { InspectTenantGate } from "@/hooks/useInspectCustomer";
import { useTenantWorkspace } from "@/hooks/useTenantWorkspace";

function ProductsBody({ customerId }: { customerId: string }) {
  const { loading, error, workspace, user } = useTenantWorkspace(customerId);

  if (loading) {
    return <div className="text-sm text-nt-text-muted">Loading tenant products…</div>;
  }

  if (error || !workspace) {
    return (
      <div className="rounded-xl border border-nt-danger/30 bg-nt-danger-soft px-4 py-3 text-sm text-nt-danger">
        {error || "Unable to load products"}
      </div>
    );
  }

  const { costSummary, subscriptions } = workspace;

  return (
    <div className="nt-fade-in">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="nt-page-title mb-1">Licenses & subscriptions</h1>
          <p className="text-sm text-nt-text-muted">
            {user?.customerName || workspace.name || workspace.customerId} · monthly $
            {costSummary.monthly.toFixed(2)}
          </p>
        </div>
        <Link href="/catalog/microsoft-365" className="nt-btn-primary text-xs">
          Browse catalog
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {subscriptions.map((s) => (
          <ProductCard key={s.id} subscription={s} />
        ))}
        {subscriptions.length === 0 && (
          <div className="nt-card p-6 text-sm text-nt-text-muted">No subscriptions yet.</div>
        )}
      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <InspectTenantGate title="Select a client tenant for Licenses">
      {(customerId) => <ProductsBody customerId={customerId} />}
    </InspectTenantGate>
  );
}
