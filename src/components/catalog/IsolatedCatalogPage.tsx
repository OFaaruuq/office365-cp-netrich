"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProductCatalog from "@/components/catalog/ProductCatalog";
import { portalFetch } from "@/lib/admin-api";
import { useSession } from "@/components/auth/SessionProvider";
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
  const { user, isPartner, isClient, ready } = useSession();
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    const customerId =
      (isClient && user.customerId) ||
      (typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("customerId")
        : null);

    if (isPartner && !customerId) {
      setError("Select a client tenant from Super Admin to inspect catalogs.");
      return;
    }

    const qs = new URLSearchParams({ catalog: catalogId });
    if (isPartner && customerId) qs.set("customerId", customerId);

    void portalFetch(`/api/products?${qs.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          if (data.code === "CATALOG_DENIED") setDenied(true);
          setError(data.error || "Catalog unavailable");
          setProducts([]);
          return;
        }
        setProducts(data.products || []);
        setError(null);
        setDenied(false);
      })
      .catch(() => setError("Failed to load catalog"));
  }, [ready, user, isPartner, isClient, catalogId]);

  if (error && (!products || products.length === 0)) {
    return (
      <div className="nt-card max-w-lg p-6">
        <h1 className="text-lg font-semibold">{TITLES[catalogId]}</h1>
        <p className="mt-2 text-sm text-nt-text-muted">{error}</p>
        {denied && (
          <p className="mt-2 text-xs text-nt-warning">
            This catalog is not enabled for your tenant. Ask netrichtechnologies Super Admin to
            enable it.
          </p>
        )}
        {isPartner && (
          <Link href="/admin/customers" className="nt-btn-primary mt-4 inline-flex">
            Open Client Tenants
          </Link>
        )}
      </div>
    );
  }

  if (!products) {
    return <div className="text-sm text-nt-text-muted">Loading isolated catalog…</div>;
  }

  return (
    <ProductCatalog
      title={TITLES[catalogId]}
      products={products}
      filters={FILTERS[catalogId] || []}
      billingModes={["Monthly", "Annual", "Triennial"]}
      showAttachPricing={catalogId === "dynamics-365"}
    />
  );
}
