"use client";

import { useEffect, useState } from "react";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

export default function Page() {
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

  useEffect(() => {
    void portalFetch("/api/csp/graph-sync")
      .then((r) => r.json())
      .then((d) => setStates(d.states || []));
  }, []);

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Graph sync state"
        subtitle="Delta tokens / last full + incremental sync per customer (Foundation). Live Graph in Phase 2."
      />
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
          </tbody>
        </table>
      </div>
    </div>
  );
}
