"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Power, Trash2 } from "lucide-react";
import { useSession } from "@/components/auth/SessionProvider";
import { portalFetch, useSuperAdminHeaders } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";
import type { CatalogProduct } from "@/lib/types";
import clsx from "clsx";

type Managed = CatalogProduct & { active?: boolean };

const CATALOGS = [
  { id: "microsoft-365", label: "Microsoft 365" },
  { id: "dynamics-365", label: "Dynamics 365" },
  { id: "azure", label: "Azure" },
  { id: "server-software", label: "Server Software" },
] as const;

const emptyForm: {
  id: string;
  name: string;
  description: string;
  category: string;
  catalog: CatalogProduct["catalog"];
  priceMonthly: number;
  priceYearly: number | "";
  compatibleAddons: boolean;
  active: boolean;
} = {
  id: "",
  name: "",
  description: "",
  category: "Microsoft 365 Suites",
  catalog: "microsoft-365",
  priceMonthly: 0,
  priceYearly: "",
  compatibleAddons: true,
  active: true,
};

export default function AdminCatalogPage() {
  const router = useRouter();
  const { isPartner, ready } = useSession();
  const headers = useSuperAdminHeaders();
  const [products, setProducts] = useState<Managed[]>([]);
  const [catalogFilter, setCatalogFilter] = useState<string>("microsoft-365");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const qs = catalogFilter ? `?catalog=${encodeURIComponent(catalogFilter)}` : "";
    const res = await portalFetch(`/api/admin/catalog${qs}`);
    const data = await res.json();
    setProducts(data.products || []);
  }

  useEffect(() => {
    if (ready && !isPartner) router.replace("/dashboard");
  }, [ready, isPartner, router]);

  useEffect(() => {
    if (isPartner) void load();
  }, [isPartner, catalogFilter]);

  const filtered = useMemo(() => products, [products]);

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await portalFetch("/api/admin/catalog", {
        method: form.id ? "PATCH" : "POST",
        headers,
        body: JSON.stringify({
          ...form,
          priceYearly: form.priceYearly === "" ? null : Number(form.priceYearly),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      setShowForm(false);
      setForm(emptyForm);
      setMessage(`Saved ${data.product.name}. Client tenants can purchase at the listed price.`);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: Managed) {
    await portalFetch("/api/admin/catalog", {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        id: p.id,
        action: p.active === false ? "activate" : "deactivate",
      }),
    });
    await load();
  }

  async function removeProduct(id: string) {
    if (!confirm("Delete this product from the catalog?")) return;
    await portalFetch(`/api/admin/catalog?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers,
    });
    await load();
  }

  if (!ready || !isPartner) {
    return <div className="text-sm text-nt-text-muted">Super Admin only…</div>;
  }

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Product catalog"
        subtitle="Add and price Microsoft 365 and other products. Client tenants only see active SKUs in enabled catalogs, then purchase and subscribe."
        actions={
          <button
            type="button"
            className="nt-btn-on-brand inline-flex items-center gap-1.5"
            onClick={() => {
              setForm({ ...emptyForm, catalog: (catalogFilter as typeof emptyForm.catalog) || "microsoft-365" });
              setShowForm(true);
            }}
          >
            <Plus size={14} />
            Add product
          </button>
        }
      />

      {error && (
        <div className="mb-4 rounded-xl border border-nt-danger/30 bg-nt-danger-soft px-4 py-3 text-sm text-nt-danger">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-xl border border-nt-success/30 bg-nt-success-soft px-4 py-3 text-sm text-nt-success">
          {message}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {CATALOGS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCatalogFilter(c.id)}
            className={clsx(
              "rounded-full px-3 py-1.5 text-xs font-semibold",
              catalogFilter === c.id
                ? "bg-nt-purple text-white"
                : "bg-white text-nt-text-muted ring-1 ring-nt-border"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {showForm && (
        <form onSubmit={saveProduct} className="nt-card mb-6 grid gap-3 p-5 md:grid-cols-2">
          <div className="md:col-span-2 text-sm font-semibold">
            {form.id ? "Edit product" : "New product"}
          </div>
          <label className="text-xs text-nt-text-muted md:col-span-2">
            Name *
            <input
              className="nt-input mt-1"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="text-xs text-nt-text-muted md:col-span-2">
            Description *
            <textarea
              className="nt-input mt-1 min-h-[72px]"
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label className="text-xs text-nt-text-muted">
            Catalog *
            <select
              className="nt-input mt-1"
              value={form.catalog}
              onChange={(e) =>
                setForm({ ...form, catalog: e.target.value as typeof form.catalog })
              }
            >
              {CATALOGS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-nt-text-muted">
            Category *
            <input
              className="nt-input mt-1"
              required
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </label>
          <label className="text-xs text-nt-text-muted">
            Price / user / month (USD) *
            <input
              className="nt-input mt-1"
              type="number"
              step="0.01"
              min="0"
              required
              value={form.priceMonthly}
              onChange={(e) => setForm({ ...form, priceMonthly: Number(e.target.value) })}
            />
          </label>
          <label className="text-xs text-nt-text-muted">
            Price / user / year (USD)
            <input
              className="nt-input mt-1"
              type="number"
              step="0.01"
              min="0"
              value={form.priceYearly}
              onChange={(e) =>
                setForm({
                  ...form,
                  priceYearly: e.target.value === "" ? "" : Number(e.target.value),
                })
              }
            />
          </label>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Active (visible to client tenants)
          </label>
          <div className="flex gap-2 md:col-span-2">
            <button type="submit" disabled={saving} className="nt-btn-primary">
              {saving ? "Saving…" : "Save product"}
            </button>
            <button
              type="button"
              className="nt-btn-outline"
              onClick={() => {
                setShowForm(false);
                setForm(emptyForm);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="nt-card overflow-hidden">
        <div className="overflow-x-auto nt-scroll">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-nt-border bg-nt-surface-muted text-[11px] font-bold tracking-wide text-nt-text-subtle uppercase">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Monthly</th>
                <th className="px-4 py-3">Yearly</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-nt-border/80 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{p.name}</div>
                    <div className="line-clamp-1 text-xs text-nt-text-muted">{p.description}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{p.category}</td>
                  <td className="px-4 py-3 font-medium">${p.priceMonthly.toFixed(2)}</td>
                  <td className="px-4 py-3 font-medium">
                    {p.priceYearly != null ? `$${p.priceYearly.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-[11px] font-bold uppercase",
                        p.active === false
                          ? "bg-nt-surface-muted text-nt-text-muted"
                          : "bg-nt-success-soft text-nt-success"
                      )}
                    >
                      {p.active === false ? "Hidden" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="nt-btn-outline py-1.5 text-xs"
                        onClick={() => {
                          setForm({
                            id: p.id,
                            name: p.name,
                            description: p.description,
                            category: p.category,
                            catalog: p.catalog,
                            priceMonthly: p.priceMonthly,
                            priceYearly: p.priceYearly ?? "",
                            compatibleAddons: Boolean(p.compatibleAddons),
                            active: p.active !== false,
                          });
                          setShowForm(true);
                        }}
                      >
                        <span className="inline-flex items-center gap-1">
                          <Pencil size={12} /> Edit
                        </span>
                      </button>
                      <button
                        type="button"
                        className="nt-btn-outline py-1.5 text-xs"
                        onClick={() => void toggleActive(p)}
                      >
                        <span className="inline-flex items-center gap-1">
                          <Power size={12} />
                          {p.active === false ? "Activate" : "Hide"}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold text-nt-danger"
                        onClick={() => void removeProduct(p.id)}
                      >
                        <span className="inline-flex items-center gap-1">
                          <Trash2 size={12} /> Delete
                        </span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-nt-text-muted">
                    No products in this catalog yet. Add one to start selling to clients.
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
