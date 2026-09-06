"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
  AlertTriangle,
  Clock,
} from "lucide-react";
import type { PortalUser, UserStatus } from "@/lib/types";
import { portalFetch } from "@/lib/admin-api";

function StatusIcon({ status }: { status: UserStatus }) {
  if (status === "active")
    return (
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-nt-blue-soft">
        <CheckCircle2 size={16} className="text-nt-blue" />
      </span>
    );
  if (status === "blocked")
    return (
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-nt-warning-soft">
        <AlertTriangle size={16} className="text-nt-warning" />
      </span>
    );
  if (status === "pending")
    return (
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-nt-surface-muted">
        <Clock size={16} className="text-nt-text-muted" />
      </span>
    );
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-nt-danger-soft">
      <XCircle size={16} className="text-nt-danger" />
    </span>
  );
}

export default function UsersTable({
  initialUsers,
  totalCount = 189,
  customerId,
}: {
  initialUsers: PortalUser[];
  totalCount?: number;
  customerId?: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ displayName: "", email: "", license: "" });
  const [sortKey, setSortKey] = useState<"user" | "licenses" | "access">("user");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = users.filter(
      (u) =>
        !q ||
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "user") cmp = a.displayName.localeCompare(b.displayName);
      else if (sortKey === "licenses")
        cmp = (a.licenses[0] || "").localeCompare(b.licenses[0] || "");
      else cmp = a.status.localeCompare(b.status);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [users, query, sortKey, sortDir]);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const qs = customerId ? `?customerId=${encodeURIComponent(customerId)}` : "";

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await portalFetch(
        customerId
          ? `/api/users/sync?customerId=${encodeURIComponent(customerId)}`
          : "/api/users/sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(customerId ? { customerId } : {}),
        }
      );
      const data = await res.json();
      if (data.users) {
        setUsers(data.users);
        setSyncMessage(
          data.source === "graph"
            ? `Synced ${data.users.length} users from Microsoft 365 Admin.`
            : `Tenant-isolated sync — ${data.users.length} users for ${data.customerId || "this tenant"} only.`
        );
      } else {
        setSyncMessage(data.error || "Sync failed");
      }
    } catch {
      setSyncMessage("Unable to reach sync API.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSyncMessage(null);
    try {
      const res = await portalFetch(`/api/users${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: form.displayName,
          email: form.email,
          licenses: form.license ? [form.license] : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncMessage(data.error || "Create failed");
        return;
      }
      setUsers(data.users || []);
      setForm({ displayName: "", email: "", license: "" });
      setShowAdd(false);
      setSyncMessage(`Created ${data.user?.email}`);
    } finally {
      setBusy(false);
    }
  }

  async function patchUser(userId: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await portalFetch(`/api/users${qs}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncMessage(data.error || "Update failed");
        return;
      }
      setUsers(data.users || []);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="nt-fade-in">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="nt-page-title mb-1">Users</h1>
          <p className="text-sm text-nt-text-muted">
            <span className="font-semibold text-nt-text">{users.length || totalCount}</span> Microsoft
            365 users — create, block, and assign licenses (Foundation directory store)
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-nt-border bg-white p-3 shadow-xs">
        <button type="button" className="nt-btn-primary" onClick={() => setShowAdd((v) => !v)}>
          Add User
        </button>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="nt-btn-outline inline-flex items-center gap-2"
        >
          {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          User Sync
        </button>
        <div className="relative ml-auto min-w-[240px] flex-1 max-w-md">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-nt-text-subtle"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users by name or email..."
            className="nt-input pl-10"
          />
        </div>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="nt-card mb-4 grid gap-3 p-4 sm:grid-cols-4">
          <input
            className="nt-input"
            placeholder="Display name"
            value={form.displayName}
            onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            required
          />
          <input
            className="nt-input"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
          <input
            className="nt-input"
            placeholder="License (optional)"
            value={form.license}
            onChange={(e) => setForm((f) => ({ ...f, license: e.target.value }))}
          />
          <button type="submit" disabled={busy} className="nt-btn-primary">
            Create
          </button>
        </form>
      )}

      {syncMessage && (
        <div className="mb-4 rounded-xl border border-nt-blue/20 bg-nt-blue-soft px-4 py-3 text-sm text-nt-text">
          {syncMessage}
        </div>
      )}

      <div className="nt-card overflow-hidden">
        <div className="overflow-x-auto nt-scroll">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-nt-border bg-nt-surface-muted text-[11px] font-bold tracking-wide text-nt-text-subtle uppercase">
                <th className="px-5 py-3.5">
                  <button
                    type="button"
                    onClick={() => toggleSort("access")}
                    className="inline-flex items-center gap-1.5"
                  >
                    Access <ArrowDownUp size={12} />
                  </button>
                </th>
                <th className="px-5 py-3.5">
                  <button
                    type="button"
                    onClick={() => toggleSort("user")}
                    className="inline-flex items-center gap-1.5"
                  >
                    User <ArrowDownUp size={12} />
                  </button>
                </th>
                <th className="px-5 py-3.5">
                  <button
                    type="button"
                    onClick={() => toggleSort("licenses")}
                    className="inline-flex items-center gap-1.5"
                  >
                    Licenses <ArrowDownUp size={12} />
                  </button>
                </th>
                <th className="px-5 py-3.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id} className="border-b border-nt-border/60 last:border-0">
                  <td className="px-5 py-3">
                    <StatusIcon status={user.status} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-semibold text-nt-text">{user.displayName}</div>
                    <div className="text-xs text-nt-text-muted">{user.email}</div>
                  </td>
                  <td className="px-5 py-3 text-nt-text-muted">
                    {user.licenses.length > 0 ? user.licenses.join(", ") : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-2">
                      {user.status === "blocked" ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="text-xs font-semibold text-nt-success"
                          onClick={() => void patchUser(user.id, { action: "unblock" })}
                        >
                          Unblock
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          className="text-xs font-semibold text-nt-warning"
                          onClick={() => void patchUser(user.id, { action: "block" })}
                        >
                          Block
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        className="text-xs font-semibold text-nt-purple"
                        onClick={() => {
                          const license = window.prompt(
                            "License SKU name (comma-separated for multiple)",
                            user.licenses.join(", ")
                          );
                          if (license == null) return;
                          void patchUser(user.id, {
                            licenses: license
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          });
                        }}
                      >
                        Licenses
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-nt-text-muted">
                    No users match.
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
