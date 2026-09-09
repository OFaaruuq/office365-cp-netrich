"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Headphones,
  KeyRound,
  Plus,
  Save,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCheck,
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

type TenantAdmin = {
  id: string;
  name: string;
  email: string;
  disabled?: boolean;
  mfa: { enrolled: boolean; enabled: boolean };
  hasCustomPassword?: boolean;
};

export default function AdminTenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id || "");
  const { isPartner, ready, user, refreshSession } = useSession();
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
  const [admins, setAdmins] = useState<TenantAdmin[]>([]);
  const [adminForm, setAdminForm] = useState({ name: "", email: "", password: "" });
  const [adminBusy, setAdminBusy] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState<{
    percent: number;
    completed: number;
    total: number;
    steps: Array<{ key: string; completed: boolean }>;
  } | null>(null);
  const [gdap, setGdap] = useState<
    Array<{
      microsoftRelationshipId: string;
      status: string;
      expiresAt?: string;
      remainingDays: number | null;
      roles: Array<{ roleName: string }>;
    }>
  >([]);
  const [viewAsReason, setViewAsReason] = useState("");
  const [viewAsBanner, setViewAsBanner] = useState<string | null>(null);
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !isPartner) router.replace("/dashboard");
  }, [ready, isPartner, router]);

  async function loadAdmins(customerId: string) {
    const res = await portalFetch(
      `/api/admin/users?customerId=${encodeURIComponent(customerId)}`
    );
    const data = await res.json();
    setAdmins(data.accounts || []);
  }

  async function loadFoundation(customerId: string) {
    const res = await portalFetch(`/api/csp/customers/${encodeURIComponent(customerId)}`);
    const data = await res.json();
    if (data.onboarding) setOnboarding(data.onboarding);
    if (data.gdap) setGdap(data.gdap);
  }

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
    await loadAdmins(c.id);
    await loadFoundation(c.id);
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

  async function runAction(action: string, force = false, approvalId?: string) {
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
        body: JSON.stringify({ id, action, force, approvalId }),
      });
      const data = await res.json();
      if (data.requiresApproval) {
        setMessage(
          `${data.message || "Approval required."} Approval ID: ${data.approval?.id}. Open Approvals, then Execute after approval.`
        );
        setPendingApprovalId(data.approval?.id || null);
        return;
      }
      if (!res.ok) {
        setError(data.error || "Action failed");
        return;
      }
      if (data.customer) {
        setCustomer(data.customer);
        setConfig({ ...DEFAULT_TENANT_CONFIG, ...data.customer.config });
      }
      setPendingApprovalId(null);
      setMessage(
        action === "approve"
          ? "Tenant approved — client portal access enabled."
          : action === "reject"
            ? "Tenant rejected."
            : action === "suspend"
              ? "Tenant disabled — portal locked."
              : action === "delete"
                ? data.message || "Tenant deleted."
                : "Updated."
      );
      if (action === "delete" && data.deleted) {
        router.replace("/admin/tenants");
        return;
      }
      if (action === "delete" && data.terminating) {
        await load();
      }
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

  async function addTenantAdmin(e: FormEvent) {
    e.preventDefault();
    setAdminBusy("create");
    setError(null);
    setMessage(null);
    try {
      const res = await portalFetch("/api/admin/users", {
        method: "POST",
        headers,
        body: JSON.stringify({
          customerId: id,
          name: adminForm.name,
          email: adminForm.email,
          password: adminForm.password || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create Client Admin");
        return;
      }
      setAdminForm({ name: "", email: "", password: "" });
      setMessage(data.message || "Client Admin added.");
      await loadAdmins(id);
    } finally {
      setAdminBusy(null);
    }
  }

  async function adminAction(accountId: string, action: string) {
    setAdminBusy(accountId);
    setError(null);
    setMessage(null);
    try {
      const res = await portalFetch("/api/admin/users", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ accountId, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Action failed");
        return;
      }
      setMessage(data.message || "Updated.");
      await loadAdmins(id);
    } finally {
      setAdminBusy(null);
    }
  }

  async function startViewAs() {
    if (!viewAsReason.trim()) {
      setError("Provide a reason for view-as-customer.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await portalFetch("/api/csp/admin-access", {
        method: "POST",
        headers,
        body: JSON.stringify({
          customerId: id,
          actorUserId: user?.accountId,
          reason: viewAsReason.trim(),
          durationMinutes: 15,
          readOnly: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not start view-as session");
        return;
      }
      setViewAsBanner(data.session?.banner || "View-as-customer active (read-only)");
      setMessage("View-as-customer session started (15 minutes, read-only). Audited.");
      const { storeViewAsSession } = await import("@/components/admin/ViewAsCustomerBanner");
      storeViewAsSession({
        customerId: id,
        customerName: customer?.name,
        reason: viewAsReason.trim(),
        expiresAt: data.session?.expiresAt || new Date(Date.now() + 15 * 60_000).toISOString(),
        banner: data.session?.banner || `Viewing ${customer?.name || id} as Partner Administrator`,
        readOnly: true,
      });
      await refreshSession();
      router.push(`/dashboard?customerId=${encodeURIComponent(id)}`);
    } finally {
      setSaving(false);
    }
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
      <Link href="/admin/tenants" className="nt-link mb-3 inline-flex items-center gap-1 text-xs">
        <ArrowLeft size={12} />
        All tenants
      </Link>

      <AdminHero
        title={customer.name}
        subtitle={`${customer.domain} · Configure GDAP, catalogs, and contacts, then approve portal access.`}
        actions={
          <>
            <StatusBadge status={customer.status} />
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/25">
              Portal {customer.config?.portalAccessEnabled ? "enabled" : "locked"}
            </span>
          </>
        }
      />

      {viewAsBanner && (
        <div className="mb-4 rounded-xl border border-nt-warning/40 bg-nt-warning-soft px-4 py-3 text-sm text-nt-warning">
          {viewAsBanner}
        </div>
      )}

      {onboarding && (
        <div className="nt-card mb-5 p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Customer onboarding</h2>
            <span className="text-xs font-semibold">
              {onboarding.completed}/{onboarding.total} · {onboarding.percent}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-nt-surface-muted">
            <div className="h-full bg-nt-purple" style={{ width: `${onboarding.percent}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {onboarding.steps.map((s) => (
              <span
                key={s.key}
                className={clsx(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  s.completed
                    ? "bg-nt-success-soft text-nt-success"
                    : "bg-nt-surface-muted text-nt-text-muted"
                )}
              >
                {s.completed ? "✓" : "○"} {s.key.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-2 sm:gap-4">
        {steps.map((s, i) => (
          <div key={s.id} className="nt-admin-step">
            <div
              className={clsx(
                "nt-admin-step-dot",
                s.done
                  ? "bg-nt-purple text-white"
                  : "bg-nt-surface-muted text-nt-text-muted ring-1 ring-nt-border"
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
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-nt-text">Client Admins</h2>
              <Link href="/admin/users" className="nt-link text-xs">
                Manage all
              </Link>
            </div>
            <p className="text-xs text-nt-text-muted">
              These admins can only access this tenant. Use Users & MFA for password changes and full
              edit.
            </p>
            <ul className="space-y-2">
              {admins.map((a) => (
                <li
                  key={a.id}
                  className="rounded-xl border border-nt-border bg-nt-surface-muted/40 px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{a.name}</div>
                      <div className="text-xs text-nt-text-muted">{a.email}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                        <span
                          className={clsx(
                            "rounded-full px-2 py-0.5",
                            a.mfa.enrolled
                              ? "bg-nt-success-soft text-nt-success"
                              : "bg-nt-warning-soft text-nt-warning"
                          )}
                        >
                          MFA {a.mfa.enrolled ? "on" : "off"}
                        </span>
                        <span
                          className={clsx(
                            "rounded-full px-2 py-0.5",
                            a.hasCustomPassword
                              ? "bg-nt-purple-soft text-nt-purple"
                              : "bg-white text-nt-text-muted"
                          )}
                        >
                          {a.hasCustomPassword ? "Custom pwd" : "Default pwd"}
                        </span>
                        <span
                          className={clsx(
                            "rounded-full px-2 py-0.5",
                            a.disabled
                              ? "bg-nt-danger-soft text-nt-danger"
                              : "bg-nt-success-soft text-nt-success"
                          )}
                        >
                          {a.disabled ? "Disabled" : "Active"}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={adminBusy === a.id}
                        onClick={() => {
                          if (confirm(`Reset MFA for ${a.email}?`)) {
                            void adminAction(a.id, "reset_mfa");
                          }
                        }}
                        className="nt-btn-outline inline-flex items-center gap-1 py-1 text-[11px]"
                      >
                        <KeyRound size={11} /> Reset MFA
                      </button>
                      {a.disabled ? (
                        <button
                          type="button"
                          disabled={adminBusy === a.id}
                          onClick={() => void adminAction(a.id, "enable")}
                          className="nt-btn-primary inline-flex items-center gap-1 py-1 text-[11px]"
                        >
                          <UserCheck size={11} /> Enable
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={adminBusy === a.id}
                          onClick={() => void adminAction(a.id, "disable")}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-nt-warning hover:underline"
                        >
                          <ShieldOff size={11} /> Disable
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={adminBusy === a.id}
                        onClick={() => {
                          if (
                            confirm(
                              `DELETE Client Admin ${a.email}? They will no longer be able to sign in.`
                            )
                          ) {
                            void adminAction(a.id, "delete");
                          }
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-nt-danger hover:underline"
                      >
                        <Trash2 size={11} /> Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
              {admins.length === 0 && (
                <li className="text-xs text-nt-text-muted">No Client Admins yet for this tenant.</li>
              )}
            </ul>
            <form onSubmit={addTenantAdmin} className="space-y-2 border-t border-nt-border pt-3">
              <div className="text-xs font-semibold text-nt-text">Add Client Admin</div>
              <input
                className="nt-input"
                placeholder="Full name"
                required
                value={adminForm.name}
                onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
              />
              <input
                className="nt-input"
                type="email"
                placeholder="Work email"
                required
                value={adminForm.email}
                onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
              />
              <input
                className="nt-input"
                type="password"
                minLength={6}
                autoComplete="new-password"
                placeholder="Password (optional, min 6)"
                value={adminForm.password}
                onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
              />
              <button
                type="submit"
                disabled={adminBusy === "create"}
                className="nt-btn-primary inline-flex w-full items-center justify-center gap-1.5 text-xs"
              >
                <Plus size={12} />
                {adminBusy === "create" ? "Adding…" : "Add to this tenant"}
              </button>
            </form>
          </div>

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

          <div className="nt-card space-y-4 p-5">
            <h2 className="text-sm font-semibold text-nt-text">GDAP</h2>
            {gdap.length === 0 ? (
              <p className="text-xs text-nt-text-muted">
                No GDAP relationship recorded. Enable GDAP below and refresh to seed expiry monitoring.
              </p>
            ) : (
              gdap.map((g) => (
                <div key={g.microsoftRelationshipId} className="rounded-xl border border-nt-border p-3 text-xs">
                  <div className="font-semibold">{g.microsoftRelationshipId}</div>
                  <div className="mt-1 text-nt-text-muted">
                    Status <strong className="text-nt-text">{g.status}</strong>
                    {g.expiresAt
                      ? ` · Expires ${new Date(g.expiresAt).toLocaleDateString()}`
                      : ""}
                    {g.remainingDays != null ? ` · ${g.remainingDays} days left` : ""}
                  </div>
                  <ul className="mt-2 space-y-0.5">
                    {g.roles.map((r) => (
                      <li key={r.roleName}>✓ {r.roleName}</li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>

          <div className="nt-card space-y-3 p-5">
            <h2 className="text-sm font-semibold text-nt-text">View as customer</h2>
            <p className="text-xs text-nt-text-muted">
              Controlled, time-boxed, read-only inspect. Requires a reason and is audited.
            </p>
            <input
              className="nt-input"
              placeholder="Reason (e.g. Investigating support ticket #48291)"
              value={viewAsReason}
              onChange={(e) => setViewAsReason(e.target.value)}
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => void startViewAs()}
              className="nt-btn-outline w-full text-xs"
            >
              Start 15-minute read-only session
            </button>
          </div>

          <div className="nt-card border-nt-purple/20 bg-nt-purple-soft/40 p-5">
            <div className="mb-2 flex items-center gap-2 text-nt-purple">
              <ShieldCheck size={18} />
              <h2 className="text-sm font-semibold">Super Admin policy</h2>
            </div>
            <p className="text-xs leading-relaxed text-nt-text-muted">
              Only Partner Super Admin can disable or delete Client Admins, change passwords, and
              reset MFA for this tenant. Delete moves enterprise records toward retention — not an
              unchecked hard wipe in production (see CSP architecture).
            </p>
            <Link
              href={`/dashboard?customerId=${encodeURIComponent(customer.id)}`}
              className="nt-link mt-3 inline-flex items-center gap-1 text-xs"
            >
              Inspect isolated workspace
            </Link>
            <Link href="/support" className="nt-link mt-2 inline-flex items-center gap-1 text-xs">
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
                onClick={() => {
                  if (
                    confirm(
                      `Suspend (disable) ${customer.name}? Client admins will be locked out.`
                    )
                  ) {
                    void runAction("suspend");
                  }
                }}
                className="nt-btn-outline text-nt-warning"
              >
                Disable tenant
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
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (
                  confirm(
                    `Terminate tenant "${customer.name}"?\n\nPortal will lock and lifecycle becomes TERMINATING (records retained). Hard purge requires force.`
                  )
                ) {
                  void runAction("delete");
                }
              }}
              className="nt-btn-outline text-nt-danger"
            >
              Terminate tenant
            </button>
            {pendingApprovalId && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void runAction("delete", false, pendingApprovalId)}
                className="nt-btn-primary"
              >
                Execute after approval
              </button>
            )}
            <Link href="/admin/security/approvals" className="nt-btn-outline text-xs">
              Open Approvals
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
