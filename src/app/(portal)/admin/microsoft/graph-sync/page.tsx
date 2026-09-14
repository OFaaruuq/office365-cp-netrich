"use client";

import { useEffect, useState } from "react";
import { portalFetch, useSuperAdminHeaders } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

export default function Page() {
  const headers = useSuperAdminHeaders();
  const [states, setStates] = useState<
    Array<{
      customerId: string;
      resource: string;
      status: string;
      lastFullSync?: string;
      lastDeltaSync?: string;
      deltaLink?: string;
    }>
  >([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const d = await portalFetch("/api/csp/graph-sync").then((r) => r.json());
    setStates(d.states || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function syncNow() {
    setBusy(true);
    setMessage(null);
    const res = await portalFetch("/api/csp/graph-sync", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "users.delta_sync" }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error || data.message || "Graph is not configured — sync was not marked successful.");
      return;
    }
    setMessage(data.source === "nest" ? "Sync job accepted by Nest." : "Sync requested.");
    await load();
  }

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Graph sync state"
        subtitle="Delta tokens and last sync per customer. Live Microsoft Graph runs only when GRAPH_* credentials are set — this page never stamps fake success."
        actions={
          <button type="button" className="nt-btn-on-brand text-xs" disabled={busy} onClick={() => void syncNow()}>
            {busy ? "Syncing…" : "Sync now"}
          </button>
        }
      />
      {message && <div className="mb-3 text-sm text-nt-text-muted">{message}</div>}
      <div className="nt-card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-nt-border bg-nt-surface-muted text-[11px] uppercase text-nt-text-subtle">
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Resource</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Last full</th>
              <th className="px-4 py-2">Last delta</th>
            </tr>
          </thead>
          <tbody>
            {states.map((s, i) => (
              <tr key={`${s.customerId}-${s.resource}-${i}`} className="border-b border-nt-border/50">
                <td className="px-4 py-2 font-mono text-xs">{s.customerId}</td>
                <td className="px-4 py-2">{s.resource}</td>
                <td className="px-4 py-2">{s.status}</td>
                <td className="px-4 py-2 text-xs text-nt-text-muted">
                  {s.lastFullSync ? new Date(s.lastFullSync).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-2 text-xs text-nt-text-muted">
                  {s.lastDeltaSync ? new Date(s.lastDeltaSync).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
            {states.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-sm text-nt-text-muted" colSpan={5}>
                  No sync state yet. Run Sync now after Graph credentials are configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
