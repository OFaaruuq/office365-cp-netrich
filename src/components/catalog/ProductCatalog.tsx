"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import type { CatalogProduct } from "@/lib/types";
import { portalFetch } from "@/lib/admin-api";
import clsx from "clsx";

export default function ProductCatalog({
  title,
  products,
  filters,
  showAttachPricing = false,
  billingModes = ["Monthly", "Annual", "Triennial"] as string[],
  canPurchase = false,
  onPurchased,
}: {
  title: string;
  products: CatalogProduct[];
  filters: string[];
  showAttachPricing?: boolean;
  billingModes?: string[];
  /** Client tenants can purchase / subscribe */
  canPurchase?: boolean;
  onPurchased?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(filters[filters.length - 1] || "All");
  const [sort, setSort] = useState("name-asc");
  const [billing, setBilling] = useState(billingModes[0]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [buyProduct, setBuyProduct] = useState<CatalogProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [buyOk, setBuyOk] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = products.filter((p) => {
      const matchesFilter =
        filter.toLowerCase().includes("all") || p.filters.includes(filter);
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });

    list = [...list].sort((a, b) => {
      if (sort === "name-desc") return b.name.localeCompare(a.name);
      if (sort === "price-asc") return a.priceMonthly - b.priceMonthly;
      if (sort === "price-desc") return b.priceMonthly - a.priceMonthly;
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [products, filter, query, sort]);

  async function confirmPurchase(e: React.FormEvent) {
    e.preventDefault();
    if (!buyProduct) return;
    setBuying(true);
    setBuyError(null);
    setBuyOk(null);
    try {
      const res = await portalFetch("/api/commerce/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: buyProduct.id,
          quantity: qty,
          billingCycle: billing,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBuyError(data.error || "Purchase failed");
        return;
      }
      setBuyOk(data.message || "Subscribed successfully");
      onPurchased?.();
      setTimeout(() => {
        setBuyProduct(null);
        setBuyOk(null);
        setQty(1);
      }, 1200);
    } finally {
      setBuying(false);
    }
  }

  const unitPreview = buyProduct
    ? billing === "Annual" && buyProduct.priceYearly != null
      ? Number((buyProduct.priceYearly / 12).toFixed(2))
      : buyProduct.priceMonthly
    : 0;

  return (
    <div className="nt-fade-in">
      <h1 className="nt-page-title">{title}</h1>

      {title === "Microsoft 365" && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-nt-blue/20 bg-nt-blue-soft/40 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-nt-text">Purchase & subscribe</div>
            <p className="mt-0.5 text-sm text-nt-text-muted">
              Prices are set by netrichtechnologies Super Admin. Add seats to subscribe for your
              tenant only.
            </p>
          </div>
        </div>
      )}

      <div className="mb-5 relative max-w-xl">
        <Search
          size={16}
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-nt-text-subtle"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products by name or feature"
          className="nt-input pl-10"
        />
      </div>

      <div className="mb-5 rounded-xl border border-nt-border bg-white p-4 shadow-xs">
        <div className="mb-3 text-[11px] font-bold tracking-wide text-nt-text-subtle uppercase">
          Filter by
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <label
              key={f}
              className={clsx(
                "cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-medium transition ring-1",
                filter === f
                  ? "bg-nt-purple text-white ring-nt-purple"
                  : "bg-nt-surface-muted text-nt-text-muted ring-nt-border hover:bg-white hover:text-nt-text"
              )}
            >
              <input
                type="radio"
                name={`filter-${title}`}
                checked={filter === f}
                onChange={() => setFilter(f)}
                className="sr-only"
              />
              {f}
            </label>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-nt-text-muted">Sort by</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-nt-border-strong bg-white px-3 py-2 text-sm outline-none focus:border-nt-purple"
          >
            <option value="name-asc">Name: A-Z</option>
            <option value="name-desc">Name: Z-A</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <div className="inline-flex overflow-hidden rounded-xl border border-nt-border bg-white p-1">
            {billingModes.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setBilling(mode)}
                className={clsx(
                  "rounded-lg px-4 py-1.5 text-sm font-semibold transition",
                  billing === mode
                    ? "bg-[#243a5e] text-white"
                    : "text-nt-text-muted hover:bg-nt-surface-muted"
                )}
              >
                {mode}
              </button>
            ))}
          </div>
          <span className="text-xs text-nt-text-subtle">
            Prices shown based on {billing.toLowerCase()} commitment.
          </span>
        </div>
      </div>

      <div className="nt-card overflow-hidden">
        <div className="border-b border-nt-border bg-nt-surface-muted px-5 py-3.5 text-sm font-semibold">
          All {title} Products
        </div>
        <div className="overflow-x-auto nt-scroll">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-nt-border bg-white text-[11px] font-bold tracking-wide text-nt-text-subtle uppercase">
                <th className="px-5 py-3.5">Manage</th>
                <th className="px-5 py-3.5">Qty</th>
                <th className="px-5 py-3.5">Product</th>
                <th className="px-5 py-3.5">Details</th>
                {showAttachPricing ? (
                  <>
                    <th className="px-5 py-3.5">Base User/Month</th>
                    <th className="px-5 py-3.5">Base User/Year</th>
                    <th className="px-5 py-3.5">Attach User/Month</th>
                    <th className="px-5 py-3.5">Attach User/Year</th>
                  </>
                ) : (
                  <>
                    <th className="px-5 py-3.5">User/Month</th>
                    <th className="px-5 py-3.5">User/Year</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-nt-border/80 align-top transition last:border-0 hover:bg-nt-purple-soft/30"
                >
                  <td className="px-5 py-4">
                    {canPurchase ? (
                      <button
                        type="button"
                        className="nt-btn-primary py-1.5 text-xs"
                        onClick={() => {
                          setBuyProduct(p);
                          setQty(p.qty > 0 ? 1 : 1);
                          setBuyError(null);
                          setBuyOk(null);
                        }}
                      >
                        {p.status === "purchased" ? "Add seats" : "Purchase / Subscribe"}
                      </button>
                    ) : (
                      <span className="text-xs text-nt-text-muted">View only</span>
                    )}
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-nt-text-muted">
                      <span
                        className={clsx(
                          "h-2 w-2 rounded-full",
                          p.status === "purchased" ? "bg-nt-success" : "bg-nt-purple"
                        )}
                      />
                      {p.status === "purchased" ? "Purchased" : "Available"}
                    </div>
                  </td>
                  <td className="px-5 py-4 font-medium">{p.qty || "—"}</td>
                  <td className="px-5 py-4">
                    <div className="font-semibold">{p.name}</div>
                  </td>
                  <td className="max-w-xs px-5 py-4">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                      }
                      className="flex items-start gap-1.5 text-left text-nt-text-muted"
                    >
                      {expanded[p.id] ? (
                        <ChevronDown size={14} className="mt-0.5 shrink-0 text-nt-purple" />
                      ) : (
                        <ChevronRight size={14} className="mt-0.5 shrink-0" />
                      )}
                      <span className={expanded[p.id] ? "" : "line-clamp-2"}>
                        {p.description}
                      </span>
                    </button>
                  </td>
                  {showAttachPricing ? (
                    <>
                      <td className="px-5 py-4 font-medium">
                        {p.priceMonthly > 0 ? `$${p.priceMonthly.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-5 py-4 font-medium">
                        {p.priceYearly != null ? `$${p.priceYearly.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-5 py-4 font-medium">
                        {p.attachMonthly != null ? `$${p.attachMonthly.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-5 py-4 font-medium">
                        {p.attachYearly != null ? `$${p.attachYearly.toFixed(2)}` : "—"}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-5 py-4 font-medium">
                        {billing === "Annual" && p.priceYearly != null
                          ? `$${(p.priceYearly / 12).toFixed(2)}`
                          : p.priceMonthly > 0
                            ? `$${p.priceMonthly.toFixed(2)}`
                            : "—"}
                      </td>
                      <td className="px-5 py-4 font-medium">
                        {billing !== "Monthly" && p.priceYearly != null
                          ? `$${p.priceYearly.toFixed(2)}`
                          : "—"}
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={showAttachPricing ? 8 : 6}
                    className="px-5 py-12 text-center text-nt-text-muted"
                  >
                    No products match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {buyProduct && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-nt-text/40 p-4 backdrop-blur-[2px] sm:items-center">
          <form
            onSubmit={confirmPurchase}
            className="nt-card w-full max-w-md overflow-hidden shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-nt-border bg-nt-purple-soft/50 px-5 py-4">
              <div>
                <div className="text-sm font-semibold">Purchase / subscribe</div>
                <div className="text-xs text-nt-text-muted">{buyProduct.name}</div>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 hover:bg-white"
                onClick={() => setBuyProduct(null)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-xs text-nt-text-muted">
                Subscription is isolated to your tenant. Billing cycle:{" "}
                <strong>{billing}</strong>
              </p>
              <label className="block text-xs font-medium text-nt-text-muted">
                Number of seats
                <input
                  className="nt-input mt-1"
                  type="number"
                  min={1}
                  max={10000}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  required
                />
              </label>
              <div className="rounded-lg bg-nt-surface-muted px-3 py-2 text-sm">
                Est. monthly:{" "}
                <strong className="text-nt-purple">
                  ${(unitPreview * qty).toFixed(2)}
                </strong>
                <span className="text-xs text-nt-text-muted">
                  {" "}
                  (${unitPreview.toFixed(2)} × {qty})
                </span>
              </div>
              {buyError && (
                <div className="text-sm text-nt-danger">{buyError}</div>
              )}
              {buyOk && <div className="text-sm text-nt-success">{buyOk}</div>}
            </div>
            <div className="flex justify-end gap-2 border-t border-nt-border bg-nt-surface-muted/40 px-5 py-3">
              <button type="button" className="nt-btn-outline" onClick={() => setBuyProduct(null)}>
                Cancel
              </button>
              <button type="submit" disabled={buying} className="nt-btn-primary">
                {buying ? "Processing…" : "Confirm subscribe"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
