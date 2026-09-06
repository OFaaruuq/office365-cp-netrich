"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  Building2,
  Check,
  Package,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import type { ClientTenant, CustomerStatus } from "@/lib/tenancy-types";
import { useSession } from "@/components/auth/SessionProvider";
import { useSuperAdminHeaders, portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge, PortalAccessBadge } from "@/components/admin/StatusBadge";
import clsx from "clsx";

type Filter = "all" | CustomerStatus;

const CATALOGS = [
  { id: "microsoft-365", label: "Microsoft 365" },
  { id: "dynamics-365", label: "Dynamics 365" },
  { id: "azure", label: "Microsoft Azure" },
  { id: "server-software", label: "Server Software" },
] as const;

const emptyForm = {
  name: "",
  domain: "",
  adminEmail: "",
  microsoftTenantId: "",
  billingContactEmail: "",
  technicalContactEmail: "",
  notes: "",
  allowedCatalogs: ["microsoft-365"] as string[],
  gdapEnabled: true,
  syncEnabled: true,
  approveImmediately: false,
};

export default function AdminTenantsPage() {
  const router = useRouter();
  const { isPartner, ready } = useSession();
  const headers = useSuperAdminHeaders();
  const [customers, setCustomers] = useState<ClientTenant[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    active: 0,
    pending: 0,
    suspended: 0,
    rejected: 0,
  });
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await portalFetch("/api/admin/customers");
    const data = await res.json();
    setCustomers(data.customers || []);
    setSummary(data.summary || summary);
  }

  useEffect(() => {
    if (ready && !isPartner) router.replace("/dashboard");
  }, [ready, isPartner, router]);

  useEffect(() => {
    if (isPartner) void load();
  }, [isPartner]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (filter !== "all" && c.status !== filter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.domain.toLowerCase().includes(q) ||
        c.adminEmail.toLowerCase().includes(q) ||
        c.microsoftTenantId.toLowerCase().includes(q)
      );
    });
  }, [customers, filter, query]);

  function toggleCatalog(id: string) {
    setForm((prev) => {
      const has = prev.allowedCatalogs.includes(id);
      const next = has
        ? prev.allowedCatalogs.filter((c) => c !== id)
        : [...prev.allowedCatalogs, id];
      return { ...prev, allowedCatalogs: next.length ? next : ["microsoft-365"] };
    });
  }

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await portalFetch("/api/admin/customers", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: form.name,
          domain: form.domain,
          adminEmail: form.adminEmail,
          microsoftTenantId: form.microsoftTenantId || undefined,
          billingContactEmail: form.billingContactEmail || form.adminEmail,
          technicalContactEmail: form.technicalContactEmail || form.adminEmail,
          notes: form.notes,
          allowedCatalogs: form.allowedCatalogs,
          gdapEnabled: form.gdapEnabled,
          syncEnabled: form.syncEnabled,
          approveImmediately: form.approveImmediately,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create tenant");
        return;
      }
      setForm(emptyForm);
      setShowForm(false);
      setMessage(data.message || "Tenant created.");
      await load();
      if (data.customer?.id) router.push(`/admin/tenants/${data.customer.id}`);
    } finally {
      setSaving(false);
    }
  }

  async function quickAction(id: string, action: string) {
    setBusyId(id);
    setError(null);
    setMessage(null);
    try {
      const res = await portalFetch("/api/admin/customers", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ id, action, force: action === "approve" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Action failed");
        return;
      }
      setMessage(data.message || (action === "delete" ? "Tenant deleted." : "Updated."));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (!ready || !isPartner) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-nt-text-muted">
        Super Admin access only…
      </div>
    );
  }

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: summary.total },
    { id: "pending", label: "Pending", count: summary.pending },
    { id: "active", label: "Active", count: summary.active },
    { id: "suspended", label: "Suspended", count: summary.suspended },
    { id: "rejected", label: "Rejected", count: summary.rejected || 0 },
  ];

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Tenants"
        subtitle="Create, configure catalogs & access, then approve portal login for each tenant."
        actions={
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="nt-btn-on-brand inline-flex items-center gap-1.5"
          >
            <Plus size={14} />
            Create tenant
          </button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Total" value={summary.total} icon={Building2} tone="purple" />
        <StatCard label="Active" value={summary.active} icon={Users} tone="success" />
        <StatCard label="Pending" value={summary.pending} icon={Package} tone="warning" />
        <StatCard label="Suspended" value={summary.suspended} icon={Ban} tone="danger" />
        <StatCard label="Rejected" value={summary.rejected || 0} icon={Ban} tone="muted" />
      </div>

      {message && (
        <div className="mb-4 rounded-xl border border-nt-success/30 bg-nt-success-soft px-4 py-3 text-sm text-nt-success">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-nt-danger/30 bg-nt-danger-soft px-4 py-3 text-sm text-nt-danger">
          {error}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-nt-text/40 p-4 backdrop-blur-[2px] sm:items-center">
          <form
            onSubmit={createTenant}
            className="nt-card max-h-[92vh] w-full max-w-2xl overflow-y-auto shadow-lg nt-scroll"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-nt-border bg-nt-purple-soft/80 px-5 py-4 backdrop-blur">
              <div>
                <div className="text-sm font-semibold text-nt-text">Create tenant</div>
                <div className="text-xs text-nt-text-muted">
                  Provision identity, catalogs, contacts, and access policy
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg p-1.5 text-nt-text-muted hover:bg-white"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <section className="space-y-3">
                <h3 className="text-xs font-bold tracking-wide text-nt-text-subtle uppercase">
                  Identity
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-nt-text-muted sm:col-span-2">
                    Company name *
                    <input
                      className="nt-input mt-1"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                      placeholder="Contoso Ltd"
                    />
                  </label>
                  <label className="text-xs font-medium text-nt-text-muted sm:col-span-2">
                    Microsoft domain *
                    <input
                      className="nt-input mt-1"
                      value={form.domain}
                      onChange={(e) => setForm({ ...form, domain: e.target.value })}
                      required
                      placeholder="contoso.onmicrosoft.com"
                    />
                  </label>
                  <label className="text-xs font-medium text-nt-text-muted sm:col-span-2">
                    Client admin email *
                    <input
                      className="nt-input mt-1"
                      type="email"
                      value={form.adminEmail}
                      onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                      required
                      placeholder="admin@contoso.com"
                    />
                  </label>
                  <label className="text-xs font-medium text-nt-text-muted sm:col-span-2">
                    Microsoft Tenant ID
                    <input
                      className="nt-input mt-1 font-mono text-xs"
                      value={form.microsoftTenantId}
                      onChange={(e) => setForm({ ...form, microsoftTenantId: e.target.value })}
                      placeholder="Optional GUID — auto-generated if blank"
                    />
                  </label>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-bold tracking-wide text-nt-text-subtle uppercase">
                  Product catalogs
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {CATALOGS.map((c) => {
                    const on = form.allowedCatalogs.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCatalog(c.id)}
                        className={clsx(
                          "flex items-center justify-between rounded-xl border px-3.5 py-3 text-left text-sm transition",
                          on
                            ? "border-nt-purple/30 bg-nt-purple-soft text-nt-purple"
                            : "border-nt-border bg-nt-surface-muted/40 text-nt-text-muted"
                        )}
                      >
                        <span className="font-semibold">{c.label}</span>
                        <span
                          className={clsx(
                            "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                            on ? "bg-nt-purple text-white" : "bg-white ring-1 ring-nt-border"
                          )}
                        >
                          {on ? <Check size={12} /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-bold tracking-wide text-nt-text-subtle uppercase">
                  Contacts & notes
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-nt-text-muted">
                    Billing contact
                    <input
                      className="nt-input mt-1"
                      type="email"
                      value={form.billingContactEmail}
                      onChange={(e) => setForm({ ...form, billingContactEmail: e.target.value })}
                      placeholder="Defaults to admin email"
                    />
                  </label>
                  <label className="text-xs font-medium text-nt-text-muted">
                    Technical contact
                    <input
                      className="nt-input mt-1"
                      type="email"
                      value={form.technicalContactEmail}
                      onChange={(e) => setForm({ ...form, technicalContactEmail: e.target.value })}
                      placeholder="Defaults to admin email"
                    />
                  </label>
                  <label className="text-xs font-medium text-nt-text-muted sm:col-span-2">
                    Internal notes
                    <textarea
                      className="nt-input mt-1 min-h-[72px] resize-y"
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      placeholder="Onboarding notes (Super Admin only)"
                    />
                  </label>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-xs font-bold tracking-wide text-nt-text-subtle uppercase">
                  Access features
                </h3>
                <div className="space-y-2 rounded-xl border border-nt-border bg-nt-surface-muted/30 p-3">
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={form.gdapEnabled}
                      onChange={(e) => setForm({ ...form, gdapEnabled: e.target.checked })}
                    />
                    <span>
                      <span className="font-semibold text-nt-text">GDAP / partner relationship</span>
                      <span className="block text-xs text-nt-text-muted">
                        Mark delegated admin as configured for this tenant.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={form.syncEnabled}
                      onChange={(e) => setForm({ ...form, syncEnabled: e.target.checked })}
                    />
                    <span>
                      <span className="font-semibold text-nt-text">Directory & license sync</span>
                      <span className="block text-xs text-nt-text-muted">
                        Allow Graph sync of users, licenses, and subscriptions.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 border-t border-nt-border pt-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={form.approveImmediately}
                      onChange={(e) => setForm({ ...form, approveImmediately: e.target.checked })}
                    />
                    <span>
                      <span className="font-semibold text-nt-text">
                        Approve & enable portal now
                      </span>
                      <span className="block text-xs text-nt-text-muted">
                        Client admin can sign in immediately after create. Leave unchecked to keep
                        pending until you review.
                      </span>
                    </span>
                  </label>
                </div>
              </section>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-nt-border bg-white px-5 py-3">
              <button type="button" onClick={() => setShowForm(false)} className="nt-btn-outline">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="nt-btn-primary">
                {saving
                  ? "Creating…"
                  : form.approveImmediately
                    ? "Create & approve"
                    : "Create as pending"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="nt-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-nt-border bg-nt-surface-muted/50 px-4 py-3">
          <div className="relative min-w-[200px] flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-nt-text-subtle"
            />
            <input
              className="nt-input pl-9"
              placeholder="Search name, domain, email, tenant ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={clsx(
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                  filter === f.id
                    ? "bg-nt-purple text-white shadow-sm"
                    : "bg-white text-nt-text-muted ring-1 ring-nt-border hover:bg-nt-purple-soft hover:text-nt-purple"
                )}
              >
                {f.label}
                <span className="ml-1 opacity-70">{f.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto nt-scroll">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-nt-border text-[11px] font-bold tracking-wide text-nt-text-subtle uppercase">
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Microsoft tenant</th>
                <th className="px-4 py-3">Catalogs</th>
                <th className="px-4 py-3">Users</th>
                <th className="px-4 py-3">Monthly</th>
                <th className="px-4 py-3">Portal</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-nt-border/80 last:border-0 hover:bg-nt-purple-soft/30"
                >
                  <td className="px-4 py-3.5">
                    <Link
                      href={`/admin/tenants/${c.id}`}
                      className="font-semibold text-nt-text hover:text-nt-purple"
                    >
                      {c.name}
                    </Link>
                    <div className="text-xs text-nt-text-muted">{c.adminEmail}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="text-xs font-medium">{c.domain}</div>
                    <div className="font-mono text-[10px] text-nt-text-subtle">
                      {(c.microsoftTenantId || "").length > 14
                        ? `${c.microsoftTenantId.slice(0, 13)}…`
                        : c.microsoftTenantId || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex max-w-[160px] flex-wrap gap-1">
                      {(c.config?.allowedCatalogs || []).map((cat) => (
                        <span
                          key={cat}
                          className="rounded bg-nt-purple-soft px-1.5 py-0.5 text-[10px] font-semibold text-nt-purple"
                        >
                          {cat.replace("-", " ")}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">{c.usersCount}</td>
                  <td className="px-4 py-3.5">${c.monthlySpend.toFixed(2)}</td>
                  <td className="px-4 py-3.5">
                    <PortalAccessBadge enabled={!!c.config?.portalAccessEnabled} />
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Link
                        href={`/admin/tenants/${c.id}`}
                        className="nt-btn-outline py-1.5 text-xs"
                      >
                        Configure
                      </Link>
                      {c.status === "pending" && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === c.id}
                            onClick={() => void quickAction(c.id, "approve")}
                            className="nt-btn-primary py-1.5 text-xs"
                          >
                            {busyId === c.id ? "…" : "Approve"}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === c.id}
                            onClick={() => void quickAction(c.id, "reject")}
                            className="text-xs font-semibold text-nt-danger hover:underline"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {c.status === "active" && (
                        <button
                          type="button"
                          disabled={busyId === c.id}
                          onClick={() => {
                            if (
                              confirm(
                                `Suspend (disable) ${c.name}? Client admins will be locked out of the portal.`
                              )
                            ) {
                              void quickAction(c.id, "suspend");
                            }
                          }}
                          className="text-xs font-semibold text-nt-warning hover:underline"
                        >
                          Disable
                        </button>
                      )}
                      {(c.status === "suspended" || c.status === "rejected") && (
                        <button
                          type="button"
                          disabled={busyId === c.id}
                          onClick={() => void quickAction(c.id, "approve")}
                          className="nt-link text-xs"
                        >
                          Re-activate
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === c.id}
                        onClick={() => {
                          if (
                            confirm(
                              `Terminate tenant "${c.name}"?\n\nLocks portal and marks TERMINATING (records retained for audit/billing).`
                            )
                          ) {
                            void quickAction(c.id, "delete");
                          }
                        }}
                        className="text-xs font-semibold text-nt-danger hover:underline"
                      >
                        Terminate
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Building2 className="mx-auto mb-2 text-nt-purple" size={24} />
                    <div className="text-sm font-medium text-nt-text">No tenants match</div>
                    <p className="mt-1 text-xs text-nt-text-muted">
                      Adjust filters or create a new tenant.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowForm(true)}
                      className="nt-btn-primary mt-4"
                    >
                      Create tenant
                    </button>
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
