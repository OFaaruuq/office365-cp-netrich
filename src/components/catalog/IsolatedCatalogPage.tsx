"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ProductCatalog from "@/components/catalog/ProductCatalog";
import { portalFetch } from "@/lib/admin-api";
import { useSession } from "@/components/auth/SessionProvider";
import { InspectTenantGate } from "@/hooks/useInspectCustomer";
import type { CatalogProduct } from "@/lib/types";

const FILTERS: Record<string, string[]> = {
  "microsoft-365": [
    "Email Security",
    "Microsoft 365 Suites",
    "Office Apps & Services",
    "Power Platform",
    "Security & Identity",
    "Teams & Voice",
    "All Microsoft 365 Products",
  ],
  "dynamics-365": ["CRM", "ERP", "Power Platform", "All Dynamics 365 Products"],
  azure: ["Compute", "Storage", "Networking", "All Azure Products"],
  "server-software": ["Windows Server", "SQL Server", "All Server Software"],
};

const TITLES: Record<string, string> = {
  "microsoft-365": "Microsoft 365",
  "dynamics-365": "Dynamics 365",
  azure: "Microsoft Azure",
  "server-software": "Server Software",
};

export default function IsolatedCatalogPage({
  catalogId,
}: {
  catalogId: "microsoft-365" | "dynamics-365" | "azure" | "server-software";
}) {
  return (
    <InspectTenantGate title={`Select a client tenant for ${TITLES[catalogId]}`}>
      {(customerId) => <CatalogBody catalogId={catalogId} customerId={customerId} />}
    </InspectTenantGate>
  );
}

function CatalogBody({
  catalogId,
  customerId,
}: {
  catalogId: "microsoft-365" | "dynamics-365" | "azure" | "server-software";
  customerId: string;
}) {
  const { user, isPartner, isClient, ready } = useSession();
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready || !user) return;

    const qs = new URLSearchParams({ catalog: catalogId, customerId });
    const res = await portalFetch(`/api/products?${qs.toString()}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Catalog unavailable");
      setProducts([]);
      return;
    }
    setProducts(data.products || []);
    setError(null);
  }, [ready, user, catalogId, customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && (!products || products.length === 0)) {
    return (
      <div className="nt-card max-w-lg p-6">
        <h1 className="text-lg font-semibold">{TITLES[catalogId]}</h1>
        <p className="mt-2 text-sm text-nt-text-muted">{error}</p>
        {isPartner && (
          <Link href="/admin/catalog" className="nt-btn-primary mt-4 inline-flex">
            Manage global catalog & pricing
          </Link>
        )}
      </div>
    );
  }

  if (!products) {
    return <div className="text-sm text-nt-text-muted">Loading catalog…</div>;
  }

  return (
    <div>
      {isPartner && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-nt-purple/20 bg-nt-purple-soft/50 px-4 py-3">
          <p className="text-sm text-nt-text">
            Inspecting this tenant&apos;s catalog (read-only). Global SKUs and prices are managed in
            Catalog Management.
          </p>
          <Link href="/admin/catalog" className="nt-btn-primary text-xs">
            Manage products & pricing
          </Link>
        </div>
      )}
      <ProductCatalog
        title={TITLES[catalogId]}
        products={products}
        filters={FILTERS[catalogId] || []}
        billingModes={["Monthly", "Annual", "Triennial"]}
        showAttachPricing={catalogId === "dynamics-365"}
        canPurchase={isClient}
        onPurchased={() => void load()}
      />
    </div>
  );
}
