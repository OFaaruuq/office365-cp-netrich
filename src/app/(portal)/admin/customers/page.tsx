"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  Building2,
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

export default function AdminCustomersPage() {
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
  const [form, setForm] = useState({
    name: "",
    domain: "",
    adminEmail: "",
    microsoftTenantId: "",
  });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function createCustomer(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await portalFetch("/api/admin/customers", {
        method: "POST",
        headers,
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create");
        return;
      }
      setForm({ name: "", domain: "", adminEmail: "", microsoftTenantId: "" });
      setShowForm(false);
      await load();
      if (data.customer?.id) router.push(`/admin/customers/${data.customer.id}`);
    } finally {
      setSaving(false);
    }
  }

  async function quickAction(id: string, action: string) {
    setBusyId(id);
    setError(null);
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
        title="Client tenants"
        subtitle="Only netrichtechnologies Super Admin creates, configures, and approves Microsoft 365 tenants. Clients cannot self-register."
        actions={
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="nt-btn-on-brand inline-flex items-center gap-1.5"
          >
            <Plus size={14} />
            Create client tenant
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

      {error && (
        <div className="mb-4 rounded-xl border border-nt-danger/30 bg-nt-danger-soft px-4 py-3 text-sm text-nt-danger">
          {error}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-nt-text/40 p-4 backdrop-blur-[2px] sm:items-center">
          <form
            onSubmit={createCustomer}
            className="nt-card w-full max-w-lg overflow-hidden shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-nt-border bg-nt-purple-soft/50 px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-nt-text">Provision client tenant</div>
                <div className="text-xs text-nt-text-muted">
                  Starts as pending until you configure and approve
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
            <div className="grid gap-3 p-5 sm:grid-cols-2">
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
            <div className="flex justify-end gap-2 border-t border-nt-border bg-nt-surface-muted/40 px-5 py-3">
              <button type="button" onClick={() => setShowForm(false)} className="nt-btn-outline">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="nt-btn-primary">
                {saving ? "Creating…" : "Create as pending"}
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
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Microsoft tenant</th>
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
                      href={`/admin/customers/${c.id}`}
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
                        href={`/admin/customers/${c.id}`}
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
                          onClick={() => void quickAction(c.id, "suspend")}
                          className="text-xs font-semibold text-nt-danger hover:underline"
                        >
                          Suspend
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
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Building2 className="mx-auto mb-2 text-nt-purple" size={24} />
                    <div className="text-sm font-medium text-nt-text">No tenants match</div>
                    <p className="mt-1 text-xs text-nt-text-muted">
                      Adjust filters or create a new client tenant.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowForm(true)}
                      className="nt-btn-primary mt-4"
                    >
                      Create client tenant
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
