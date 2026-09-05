"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import type { CatalogProduct } from "@/lib/types";
import clsx from "clsx";

export default function ProductCatalog({
  title,
  products,
  filters,
  showAttachPricing = false,
  billingModes = ["Monthly", "Annual", "Triennial"] as string[],
}: {
  title: string;
  products: CatalogProduct[];
  filters: string[];
  showAttachPricing?: boolean;
  billingModes?: string[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(filters[filters.length - 1] || "All");
  const [sort, setSort] = useState("name-asc");
  const [billing, setBilling] = useState(billingModes[0]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

  return (
    <div className="nt-fade-in">
      <h1 className="nt-page-title">{title}</h1>

      {title === "Microsoft 365" && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-nt-blue/20 bg-gradient-to-r from-nt-blue-soft to-white px-5 py-4 shadow-xs">
          <div>
            <div className="text-sm font-semibold text-nt-text">Recommended for you</div>
            <p className="mt-0.5 text-sm text-nt-text-muted">
              Based on your current subscriptions, we recommend security and productivity
              add-ons.
            </p>
          </div>
          <button type="button" className="nt-btn-outline bg-white">
            View recommendations
          </button>
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
            className="rounded-lg border border-nt-border-strong bg-white px-3 py-2 text-sm outline-none focus:border-nt-purple focus:shadow-[0_0_0_3px_rgba(92,45,145,0.15)]"
          >
            <option value="name-asc">Name: A-Z</option>
            <option value="name-desc">Name: Z-A</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <div className="inline-flex overflow-hidden rounded-xl border border-nt-border bg-white p-1 shadow-xs">
            {billingModes.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setBilling(mode)}
                className={clsx(
                  "rounded-lg px-4 py-1.5 text-sm font-semibold transition",
                  billing === mode
                    ? "bg-[#243a5e] text-white shadow-sm"
                    : "text-nt-text-muted hover:bg-nt-surface-muted hover:text-nt-text"
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
                    <button type="button" className="nt-link text-xs font-semibold">
                      {p.status === "purchased" ? "Manage Subscriptions" : "Add Subscriptions"}
                    </button>
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
                    {p.compatibleAddons && (
                      <button type="button" className="nt-link mt-1 text-xs">
                        Compatible Add-ons
                      </button>
                    )}
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
    </div>
  );
}
