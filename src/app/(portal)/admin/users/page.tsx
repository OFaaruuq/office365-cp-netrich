"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  Lock,
  Pencil,
  Plus,
  Search,
  ShieldOff,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useSession } from "@/components/auth/SessionProvider";
import { portalFetch, useSuperAdminHeaders } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";
import { roleLabel, type PortalRole } from "@/lib/tenancy-types";
import clsx from "clsx";

type AdminRow = {
  id: string;
  name: string;
  email: string;
  role: PortalRole;
  customerId?: string;
  customerName?: string;
  disabled?: boolean;
  mfa: { enrolled: boolean; enabled: boolean; enrolledAt?: string };
  hasCustomPassword?: boolean;
};

type Tab = "clients" | "staff";

type Modal =
  | null
  | { type: "create" }
  | { type: "edit"; account: AdminRow }
  | { type: "password"; account: AdminRow };

export default function AdminUsersPage() {
  const router = useRouter();
  const { isPartner, ready, user } = useSession();
  const headers = useSuperAdminHeaders();
  const [tab, setTab] = useState<Tab>("clients");
  const [accounts, setAccounts] = useState<AdminRow[]>([]);
  const [tenants, setTenants] = useState<Array<{ id: string; name: string }>>([]);
  const [query, setQuery] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [form, setForm] = useState({
    customerId: "",
    name: "",
    email: "",
    role: "partner_admin" as "partner_admin" | "support_technical" | "support_billing",
    password: "",
    confirmPassword: "",
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function resetForm() {
    setForm({
      customerId: "",
      name: "",
      email: "",
      role: "partner_admin",
      password: "",
      confirmPassword: "",
    });
  }

  async function load(scope: Tab = tab) {
    const [usersRes, custRes] = await Promise.all([
      portalFetch(`/api/admin/users?scope=${scope === "staff" ? "staff" : "clients"}`),
      portalFetch("/api/admin/customers"),
    ]);
    const usersData = await usersRes.json();
    const custData = await custRes.json();
    setAccounts(usersData.accounts || []);
    setTenants(
      (custData.customers || []).map((c: { id: string; name: string }) => ({
        id: c.id,
        name: c.name,
      }))
    );
  }

  useEffect(() => {
    if (ready && !isPartner) router.replace("/dashboard");
  }, [ready, isPartner, router]);

  useEffect(() => {
    if (isPartner) void load(tab);
  }, [isPartner, tab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((a) => {
      if (tab === "clients" && tenantFilter && a.customerId !== tenantFilter) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.customerName || "").toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q)
      );
    });
  }, [accounts, query, tenantFilter, tab]);

  function openCreate() {
    resetForm();
    setError(null);
    setModal({ type: "create" });
  }

  function openEdit(account: AdminRow) {
    setForm({
      customerId: account.customerId || "",
      name: account.name,
      email: account.email,
      role: (account.role === "customer_admin"
        ? "partner_admin"
        : account.role) as typeof form.role,
      password: "",
      confirmPassword: "",
    });
    setError(null);
    setModal({ type: "edit", account });
  }

  function openPassword(account: AdminRow) {
    setForm((f) => ({ ...f, password: "", confirmPassword: "" }));
    setError(null);
    setModal({ type: "password", account });
  }

  async function createAccount(e: FormEvent) {
    e.preventDefault();
    if (form.password && form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const body =
        tab === "staff"
          ? {
              kind: "staff",
              name: form.name,
              email: form.email,
              role: form.role,
              password: form.password || undefined,
            }
          : {
              kind: "client",
              customerId: form.customerId,
              name: form.name,
              email: form.email,
              password: form.password || undefined,
            };
      const res = await portalFetch("/api/admin/users", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Create failed");
        return;
      }
      setModal(null);
      resetForm();
      setMessage(data.message || "Account created.");
      await load(tab);
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!modal || modal.type !== "edit") return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await portalFetch("/api/admin/users", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          accountId: modal.account.id,
          name: form.name,
          email: form.email,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Update failed");
        return;
      }
      setModal(null);
      resetForm();
      setMessage(data.message || "User profile saved.");
      await load(tab);
    } finally {
      setSaving(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (!modal || modal.type !== "password") return;
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await portalFetch("/api/admin/users", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          accountId: modal.account.id,
          action: "set_password",
          password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Password change failed");
        return;
      }
      setModal(null);
      resetForm();
      setMessage(data.message || "Password updated.");
      await load(tab);
    } finally {
      setSaving(false);
    }
  }

  async function runAction(accountId: string, action: string) {
    setBusyId(accountId);
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
      await load(tab);
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

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Users & MFA"
        subtitle="Partner Super Admin manages Client Admins and portal staff — edit, set passwords, reset MFA, disable, or delete any account except your own."
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="nt-btn-on-brand inline-flex items-center gap-1.5"
          >
            <Plus size={14} />
            {tab === "staff" ? "Add portal user" : "Add Client Admin"}
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("clients")}
          className={clsx(
            "rounded-full px-4 py-1.5 text-xs font-semibold",
            tab === "clients"
              ? "bg-nt-purple text-white"
              : "bg-white text-nt-text-muted ring-1 ring-nt-border"
          )}
        >
          Client Admins (tenants)
        </button>
        <button
          type="button"
          onClick={() => setTab("staff")}
          className={clsx(
            "rounded-full px-4 py-1.5 text-xs font-semibold",
            tab === "staff"
              ? "bg-nt-purple text-white"
              : "bg-white text-nt-text-muted ring-1 ring-nt-border"
          )}
        >
          Super Admin & Support
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded-xl border border-nt-success/30 bg-nt-success-soft px-4 py-3 text-sm text-nt-success">
          {message}
        </div>
      )}
      {error && !modal && (
        <div className="mb-4 rounded-xl border border-nt-danger/30 bg-nt-danger-soft px-4 py-3 text-sm text-nt-danger">
          {error}
        </div>
      )}

      {modal?.type === "create" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-nt-text/40 p-4 backdrop-blur-[2px] sm:items-center">
          <form onSubmit={createAccount} className="nt-card w-full max-w-lg overflow-hidden shadow-lg">
            <div className="flex items-center justify-between border-b border-nt-border bg-nt-purple-soft/50 px-5 py-4">
              <div>
                <div className="text-sm font-semibold">
                  {tab === "staff" ? "Add Super Admin / Support" : "Add Client Admin"}
                </div>
                <div className="text-xs text-nt-text-muted">
                  Optional password — leave blank to use the default demo password
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg p-1.5 hover:bg-white"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 p-5">
              {error && (
                <div className="rounded-lg border border-nt-danger/30 bg-nt-danger-soft px-3 py-2 text-xs text-nt-danger">
                  {error}
                </div>
              )}
              {tab === "clients" ? (
                <label className="block text-xs font-medium text-nt-text-muted">
                  Tenant *
                  <select
                    className="nt-input mt-1"
                    required
                    value={form.customerId}
                    onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                  >
                    <option value="">Select tenant…</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="block text-xs font-medium text-nt-text-muted">
                  Role *
                  <select
                    className="nt-input mt-1"
                    value={form.role}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        role: e.target.value as typeof form.role,
                      })
                    }
                  >
                    <option value="partner_admin">Partner Super Admin</option>
                    <option value="support_technical">Technical Support</option>
                    <option value="support_billing">Billing Support</option>
                  </select>
                </label>
              )}
              <label className="block text-xs font-medium text-nt-text-muted">
                Full name *
                <input
                  className="nt-input mt-1"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="block text-xs font-medium text-nt-text-muted">
                Work email *
                <input
                  className="nt-input mt-1"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label className="block text-xs font-medium text-nt-text-muted">
                Password (optional)
                <input
                  className="nt-input mt-1"
                  type="password"
                  minLength={6}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Min 6 characters"
                />
              </label>
              {form.password ? (
                <label className="block text-xs font-medium text-nt-text-muted">
                  Confirm password *
                  <input
                    className="nt-input mt-1"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  />
                </label>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-nt-border px-5 py-3">
              <button type="button" onClick={() => setModal(null)} className="nt-btn-outline">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="nt-btn-primary">
                {saving ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}

      {modal?.type === "edit" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-nt-text/40 p-4 backdrop-blur-[2px] sm:items-center">
          <form onSubmit={saveEdit} className="nt-card w-full max-w-lg overflow-hidden shadow-lg">
            <div className="flex items-center justify-between border-b border-nt-border bg-nt-purple-soft/50 px-5 py-4">
              <div>
                <div className="text-sm font-semibold">Edit user</div>
                <div className="text-xs text-nt-text-muted">{modal.account.email}</div>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg p-1.5 hover:bg-white"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 p-5">
              {error && (
                <div className="rounded-lg border border-nt-danger/30 bg-nt-danger-soft px-3 py-2 text-xs text-nt-danger">
                  {error}
                </div>
              )}
              <label className="block text-xs font-medium text-nt-text-muted">
                Full name *
                <input
                  className="nt-input mt-1"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="block text-xs font-medium text-nt-text-muted">
                Work email *
                <input
                  className="nt-input mt-1"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-nt-border px-5 py-3">
              <button type="button" onClick={() => setModal(null)} className="nt-btn-outline">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="nt-btn-primary">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      {modal?.type === "password" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-nt-text/40 p-4 backdrop-blur-[2px] sm:items-center">
          <form onSubmit={savePassword} className="nt-card w-full max-w-lg overflow-hidden shadow-lg">
            <div className="flex items-center justify-between border-b border-nt-border bg-nt-purple-soft/50 px-5 py-4">
              <div>
                <div className="text-sm font-semibold">Change password</div>
                <div className="text-xs text-nt-text-muted">
                  Set a new login password for {modal.account.email}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg p-1.5 hover:bg-white"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 p-5">
              {error && (
                <div className="rounded-lg border border-nt-danger/30 bg-nt-danger-soft px-3 py-2 text-xs text-nt-danger">
                  {error}
                </div>
              )}
              <label className="block text-xs font-medium text-nt-text-muted">
                New password *
                <input
                  className="nt-input mt-1"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Min 6 characters"
                />
              </label>
              <label className="block text-xs font-medium text-nt-text-muted">
                Confirm password *
                <input
                  className="nt-input mt-1"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                />
              </label>
              {modal.account.hasCustomPassword && (
                <button
                  type="button"
                  disabled={busyId === modal.account.id}
                  onClick={() => {
                    if (
                      confirm(
                        `Clear custom password for ${modal.account.email}? They will use the default demo password again.`
                      )
                    ) {
                      void runAction(modal.account.id, "clear_password").then(() => {
                        setModal(null);
                        resetForm();
                      });
                    }
                  }}
                  className="text-xs font-semibold text-nt-danger hover:underline"
                >
                  Clear custom password (revert to demo)
                </button>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-nt-border px-5 py-3">
              <button type="button" onClick={() => setModal(null)} className="nt-btn-outline">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="nt-btn-primary">
                {saving ? "Updating…" : "Set password"}
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
              placeholder="Search name, email, role…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {tab === "clients" && (
            <select
              className="nt-input max-w-xs"
              value={tenantFilter}
              onChange={(e) => setTenantFilter(e.target.value)}
            >
              <option value="">All tenants</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="overflow-x-auto nt-scroll">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead>
              <tr className="border-b border-nt-border text-[11px] font-bold tracking-wide text-nt-text-subtle uppercase">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">{tab === "clients" ? "Tenant" : "Team"}</th>
                <th className="px-4 py-3">Password</th>
                <th className="px-4 py-3">MFA</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-nt-border/80 last:border-0 hover:bg-nt-purple-soft/30"
                >
                  <td className="px-4 py-3.5">
                    <div className="font-semibold text-nt-text">{a.name}</div>
                    <div className="text-xs text-nt-text-muted">{a.email}</div>
                    {user?.accountId === a.id && (
                      <div className="mt-0.5 text-[10px] font-semibold text-nt-purple">You</div>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-xs font-medium">{roleLabel(a.role)}</td>
                  <td className="px-4 py-3.5">
                    {tab === "clients" ? (
                      a.customerId ? (
                        <Link
                          href={`/admin/tenants/${a.customerId}`}
                          className="font-medium text-nt-purple hover:underline"
                        >
                          {a.customerName || a.customerId}
                        </Link>
                      ) : (
                        "—"
                      )
                    ) : (
                      <span className="text-xs text-nt-text-muted">
                        {a.role === "partner_admin"
                          ? "netrichtechnologies"
                          : a.role.replace("support_", "")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        a.hasCustomPassword
                          ? "bg-nt-purple-soft text-nt-purple"
                          : "bg-nt-surface-muted text-nt-text-muted"
                      )}
                    >
                      {a.hasCustomPassword ? "Custom" : "Default"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        a.mfa.enrolled
                          ? "bg-nt-success-soft text-nt-success"
                          : "bg-nt-warning-soft text-nt-warning"
                      )}
                    >
                      {a.mfa.enrolled ? "Enrolled" : "Not enrolled"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        a.disabled
                          ? "bg-nt-danger-soft text-nt-danger"
                          : "bg-nt-success-soft text-nt-success"
                      )}
                    >
                      {a.disabled ? "Disabled" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() => openEdit(a)}
                        className="nt-btn-outline inline-flex items-center gap-1 py-1.5 text-xs"
                      >
                        <Pencil size={12} />
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() => openPassword(a)}
                        className="nt-btn-outline inline-flex items-center gap-1 py-1.5 text-xs"
                      >
                        <Lock size={12} />
                        Password
                      </button>
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() => {
                          if (
                            confirm(
                              `Reset MFA for ${a.email}? They must re-enroll Google Authenticator on next login.`
                            )
                          ) {
                            void runAction(a.id, "reset_mfa");
                          }
                        }}
                        className="nt-btn-outline inline-flex items-center gap-1 py-1.5 text-xs"
                      >
                        <KeyRound size={12} />
                        Reset MFA
                      </button>
                      {user?.accountId !== a.id &&
                        (a.disabled ? (
                          <button
                            type="button"
                            disabled={busyId === a.id}
                            onClick={() => void runAction(a.id, "enable")}
                            className="nt-btn-primary inline-flex items-center gap-1 py-1.5 text-xs"
                          >
                            <UserCheck size={12} />
                            Enable
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busyId === a.id}
                            onClick={() => void runAction(a.id, "disable")}
                            className="text-xs font-semibold text-nt-warning hover:underline"
                          >
                            <span className="inline-flex items-center gap-1">
                              <ShieldOff size={12} /> Disable
                            </span>
                          </button>
                        ))}
                      {user?.accountId !== a.id && (
                        <button
                          type="button"
                          disabled={busyId === a.id}
                          onClick={() => {
                            if (
                              confirm(
                                `DELETE user ${a.email} permanently?\n\nThey will no longer be able to sign in. This cannot be undone.`
                              )
                            ) {
                              void runAction(a.id, "delete");
                            }
                          }}
                          className="text-xs font-semibold text-nt-danger hover:underline"
                        >
                          <span className="inline-flex items-center gap-1">
                            <Trash2 size={12} /> Delete
                          </span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Users className="mx-auto mb-2 text-nt-purple" size={24} />
                    <div className="text-sm font-medium">No users found</div>
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
