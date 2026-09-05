"use client";

import Link from "next/link";
import ProductCard from "@/components/products/ProductCard";
import { useTenantWorkspace } from "@/hooks/useTenantWorkspace";

export default function ProductsPage() {
  const { loading, error, workspace, needsCustomerPick, user } = useTenantWorkspace();

  if (loading) {
    return <div className="text-sm text-nt-text-muted">Loading tenant products…</div>;
  }

  if (needsCustomerPick) {
    return (
      <div className="nt-card max-w-lg p-6">
        <h1 className="text-lg font-semibold">Select a client tenant</h1>
        <p className="mt-2 text-sm text-nt-text-muted">
          Purchased products are isolated per tenant.
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
        {error || "Unable to load products"}
      </div>
    );
  }

  const { costSummary, subscriptions } = workspace;

  return (
    <div className="nt-fade-in">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="nt-page-title mb-0">Purchased Products</h1>
          <p className="mt-1 text-xs text-nt-text-muted">
            Isolated to{" "}
            <strong className="text-nt-purple">{user?.customerName || workspace.customerId}</strong>
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-nt-text">Business</h2>
        <Link href="/catalog/microsoft-365" className="nt-btn-primary">
          + Add New Business Product
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Monthly", costSummary.monthly],
          ["*Yearly", costSummary.yearly],
          ["*Triennially", costSummary.triennially],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-xl border border-nt-border bg-white px-5 py-3.5 shadow-xs"
          >
            <div className="text-[11px] font-bold tracking-wide text-nt-text-subtle uppercase">
              {label}
            </div>
            <div className="mt-1 text-xl font-semibold tracking-tight text-nt-text">
              ${Number(value).toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {subscriptions.map((sub) => (
          <ProductCard key={sub.id} subscription={sub} />
        ))}
        {subscriptions.length === 0 && (
          <p className="text-sm text-nt-text-muted">No purchased products in this tenant.</p>
        )}
      </div>
    </div>
  );
}
