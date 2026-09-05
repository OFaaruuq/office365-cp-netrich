"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Headphones,
  Save,
  ShieldCheck,
} from "lucide-react";
import type { ClientTenant, ClientTenantConfig } from "@/lib/tenancy-types";
import { DEFAULT_TENANT_CONFIG } from "@/lib/tenancy-data";
import { useSession } from "@/components/auth/SessionProvider";
import { useSuperAdminHeaders, portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Toggle } from "@/components/admin/Toggle";
import clsx from "clsx";

const CATALOGS = [
  { id: "microsoft-365", label: "Microsoft 365" },
  { id: "dynamics-365", label: "Dynamics 365" },
  { id: "azure", label: "Microsoft Azure" },
  { id: "server-software", label: "Server Software" },
] as const;

export default function AdminCustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id || "");
  const { isPartner, ready } = useSession();
  const headers = useSuperAdminHeaders();
  const [customer, setCustomer] = useState<ClientTenant | null>(null);
  const [audit, setAudit] = useState<
    Array<{ id: string; at: string; action: string; actorEmail: string; detail?: string }>
  >([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [config, setConfig] = useState<ClientTenantConfig>(DEFAULT_TENANT_CONFIG);

  useEffect(() => {
    if (ready && !isPartner) router.replace("/dashboard");
  }, [ready, isPartner, router]);

  async function load() {
    const res = await portalFetch(`/api/admin/customers?id=${encodeURIComponent(id)}`);
    const data = await res.json();
    const c = data.customer as ClientTenant | undefined;
    if (!c) {
      setError("Tenant not found");
      return;
    }
    setCustomer(c);
    setAudit(data.audit || []);
    setName(c.name);
    setDomain(c.domain);
    setAdminEmail(c.adminEmail);
    setTenantId(c.microsoftTenantId);
    setConfig({ ...DEFAULT_TENANT_CONFIG, ...c.config });
  }

  useEffect(() => {
    if (id && isPartner) void load();
  }, [id, isPartner]);

  async function saveConfigure() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await portalFetch("/api/admin/customers", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          id,
          action: "configure",
          name,
          domain,
          adminEmail,
          microsoftTenantId: tenantId,
          config,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      setCustomer(data.customer);
      setMessage("Configuration saved.");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action: string, force = false) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (action === "approve") {
        const prep = await portalFetch("/api/admin/customers", {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            id,
            action: "configure",
            name,
            domain,
            adminEmail,
            microsoftTenantId: tenantId,
            config: {
              ...config,
              portalAccessEnabled: true,
              syncEnabled: true,
              gdapEnabled: true,
              billingContactEmail: config.billingContactEmail || adminEmail,
              technicalContactEmail: config.technicalContactEmail || adminEmail,
            },
          }),
        });
        if (!prep.ok) {
          const data = await prep.json();
          setError(data.error || "Could not prepare approval");
          return;
        }
      }
      const res = await portalFetch("/api/admin/customers", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ id, action, force }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Action failed");
        return;
      }
      setCustomer(data.customer);
      setConfig({ ...DEFAULT_TENANT_CONFIG, ...data.customer.config });
      setMessage(
        action === "approve"
          ? "Tenant approved — client portal access enabled."
          : action === "reject"
            ? "Tenant rejected."
            : action === "suspend"
              ? "Tenant suspended — portal locked."
              : "Updated."
      );
    } finally {
      setSaving(false);
    }
  }

  function toggleCatalog(catalogId: (typeof CATALOGS)[number]["id"]) {
    setConfig((prev) => {
      const has = prev.allowedCatalogs.includes(catalogId);
      return {
        ...prev,
        allowedCatalogs: has
          ? prev.allowedCatalogs.filter((c) => c !== catalogId)
          : [...prev.allowedCatalogs, catalogId],
      };
    });
  }

  if (!ready || !isPartner) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-nt-text-muted">
        Checking Super Admin access…
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-nt-text-muted">
        {error || "Loading tenant configuration…"}
      </div>
    );
  }

  const steps = [
    { id: 1, label: "Created", done: true },
    {
      id: 2,
      label: "Configured",
      done: Boolean(customer.configuredAt || customer.config?.gdapEnabled),
    },
    { id: 3, label: "Approved", done: customer.status === "active" },
  ];

  return (
    <div className="nt-fade-in pb-24">
      <Link
        href="/admin/customers"
        className="nt-link mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeft size={12} />
        All client tenants
      </Link>

      <AdminHero
        title={customer.name}
        subtitle={`${customer.domain} · Configure GDAP, catalogs, and contacts, then approve portal access.`}
        actions={
          <>
            <StatusBadge status={customer.status} />
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/25">
              Portal{" "}
              {customer.config?.portalAccessEnabled ? "enabled" : "locked"}
            </span>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2 sm:gap-4">
        {steps.map((s, i) => (
          <div key={s.id} className="nt-admin-step">
            <div
              className={clsx(
                "nt-admin-step-dot",
                s.done ? "bg-nt-purple text-white" : "bg-nt-surface-muted text-nt-text-muted ring-1 ring-nt-border"
              )}
            >
              {s.done ? <Check size={14} /> : s.id}
            </div>
            <span
              className={clsx(
                "text-xs font-semibold",
                s.done ? "text-nt-text" : "text-nt-text-muted"
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span className="mx-1 hidden h-px w-8 bg-nt-border sm:block" />
            )}
          </div>
        ))}
        {customer.approvedBy && (
          <span className="ml-auto text-xs text-nt-text-muted">
            Approved by <strong className="text-nt-text">{customer.approvedBy}</strong>
          </span>
        )}
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

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <div className="nt-card space-y-4 p-5">
            <h2 className="text-sm font-semibold text-nt-text">Tenant identity</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-nt-text-muted">
                Company name
                <input
                  className="nt-input mt-1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="text-xs font-medium text-nt-text-muted">
                Microsoft domain
                <input
                  className="nt-input mt-1"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                />
              </label>
              <label className="text-xs font-medium text-nt-text-muted">
                Client admin email
                <input
                  className="nt-input mt-1"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                />
              </label>
              <label className="text-xs font-medium text-nt-text-muted">
                Microsoft Tenant ID
                <input
                  className="nt-input mt-1 font-mono text-xs"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="nt-card space-y-4 p-5">
            <h2 className="text-sm font-semibold text-nt-text">Integration & access</h2>
            <div className="space-y-2.5">
              <Toggle
                checked={config.gdapEnabled}
                onChange={(v) => setConfig({ ...config, gdapEnabled: v })}
                label="GDAP / partner relationship"
                description="Delegated admin privileges configured for this tenant."
              />
              <Toggle
                checked={config.syncEnabled}
                onChange={(v) => setConfig({ ...config, syncEnabled: v })}
                label="Directory & license sync"
                description="Pull users, licenses, and subscriptions from Microsoft Graph."
              />
              <Toggle
                checked={config.portalAccessEnabled}
                onChange={(v) => setConfig({ ...config, portalAccessEnabled: v })}
                label="Client portal access"
                description="When enabled, the client admin can sign in to the control panel."
              />
            </div>
          </div>

          <div className="nt-card space-y-4 p-5">
            <h2 className="text-sm font-semibold text-nt-text">Allowed product catalogs</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {CATALOGS.map((c) => {
                const on = config.allowedCatalogs.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCatalog(c.id)}
                    className={clsx(
                      "flex items-center justify-between rounded-xl border px-3.5 py-3 text-left text-sm transition",
                      on
                        ? "border-nt-purple/30 bg-nt-purple-soft text-nt-purple"
                        : "border-nt-border bg-nt-surface-muted/40 text-nt-text-muted hover:border-nt-border-strong"
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
          </div>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <div className="nt-card space-y-4 p-5">
            <h2 className="text-sm font-semibold text-nt-text">Contacts & notes</h2>
            <label className="block text-xs font-medium text-nt-text-muted">
              Billing contact
              <input
                className="nt-input mt-1"
                value={config.billingContactEmail}
                onChange={(e) => setConfig({ ...config, billingContactEmail: e.target.value })}
                placeholder={adminEmail}
              />
            </label>
            <label className="block text-xs font-medium text-nt-text-muted">
              Technical contact
              <input
                className="nt-input mt-1"
                value={config.technicalContactEmail}
                onChange={(e) => setConfig({ ...config, technicalContactEmail: e.target.value })}
                placeholder={adminEmail}
              />
            </label>
            <label className="block text-xs font-medium text-nt-text-muted">
              Internal notes
              <textarea
                className="nt-input mt-1 min-h-[110px] resize-y"
                value={config.notes}
                onChange={(e) => setConfig({ ...config, notes: e.target.value })}
                placeholder="Onboarding notes visible only to Netrich Super Admin…"
              />
            </label>
          </div>

          <div className="nt-card border-nt-purple/20 bg-nt-purple-soft/40 p-5">
            <div className="mb-2 flex items-center gap-2 text-nt-purple">
              <ShieldCheck size={18} />
              <h2 className="text-sm font-semibold">Super Admin policy</h2>
            </div>
            <p className="text-xs leading-relaxed text-nt-text-muted">
              Only partner Super Admin can create, configure, approve, reject, or suspend this
              tenant. Client admins never self-provision. Inspect actions are audited.
            </p>
            <Link
              href={`/dashboard?customerId=${encodeURIComponent(customer.id)}`}
              className="nt-link mt-3 inline-flex items-center gap-1 text-xs"
            >
              Inspect isolated workspace
            </Link>
            <Link
              href="/support"
              className="nt-link mt-2 inline-flex items-center gap-1 text-xs"
            >
              <Headphones size={12} />
              Open support inbox
            </Link>
          </div>

          <div className="nt-card p-5">
            <h2 className="mb-3 text-sm font-semibold text-nt-text">Isolation audit trail</h2>
            {audit.length === 0 ? (
              <p className="text-xs text-nt-text-muted">No events yet for this tenant.</p>
            ) : (
              <ul className="max-h-64 space-y-2 overflow-y-auto nt-scroll">
                {audit.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-lg border border-nt-border bg-nt-surface-muted/40 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-[11px] font-bold tracking-wide text-nt-purple uppercase">
                        {e.action}
                      </span>
                      <span className="text-[10px] text-nt-text-subtle">
                        {new Date(e.at).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-nt-text-muted">
                      {e.actorEmail}
                      {e.detail ? ` · ${e.detail}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="fixed right-0 bottom-0 left-0 z-30 border-t border-nt-border bg-white/95 px-4 py-3 backdrop-blur lg:left-[var(--nt-sidebar-width)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-nt-text-muted">
            Changes apply to <strong className="text-nt-text">{customer.name}</strong>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveConfigure()}
              className="nt-btn-outline inline-flex items-center gap-1.5"
            >
              <Save size={14} />
              {saving ? "Saving…" : "Save configuration"}
            </button>
            {customer.status !== "active" && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void runAction("approve", true)}
                className="nt-btn-primary inline-flex items-center gap-1.5"
              >
                <ShieldCheck size={14} />
                Approve & enable portal
              </button>
            )}
            {customer.status === "pending" && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void runAction("reject")}
                className="nt-btn-outline text-nt-danger"
              >
                Reject
              </button>
            )}
            {customer.status === "active" && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void runAction("suspend")}
                className="nt-btn-outline text-nt-danger"
              >
                Suspend tenant
              </button>
            )}
            {(customer.status === "suspended" || customer.status === "rejected") && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void runAction("approve", true)}
                className="nt-btn-primary"
              >
                Re-activate
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
