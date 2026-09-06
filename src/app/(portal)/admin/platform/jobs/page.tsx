"use client";

import { useEffect, useState } from "react";
import { portalFetch, useSuperAdminHeaders } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

type Job = {
  id: string;
  name: string;
  queue: string;
  customerId?: string;
  status: string;
  attempts: number;
  lastError?: string;
};

export default function Page() {
  const headers = useSuperAdminHeaders();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [deadOnly, setDeadOnly] = useState(true);
  async function load() {
    const q = deadOnly ? "?status=dead_letter" : "";
    const d = await portalFetch(`/api/csp/jobs${q}`).then((r) => r.json());
    setJobs(d.jobs || []);
  }
  useEffect(() => {
    void load();
  }, [deadOnly]);
  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Jobs & dead-letter"
        subtitle="Background sync jobs. Failed Microsoft API work must never be silent."
        actions={
          <button type="button" className="nt-btn-on-brand text-xs" onClick={() => setDeadOnly((v) => !v)}>
            {deadOnly ? "Show all jobs" : "Show dead-letter only"}
          </button>
        }
      />
      <div className="space-y-2">
        {jobs.map((j) => (
          <div key={j.id} className="nt-card flex flex-wrap items-start justify-between gap-2 p-4">
            <div>
              <div className="font-semibold">{j.name}</div>
              <div className="text-xs text-nt-text-muted">
                {j.queue} · {j.status} · attempts {j.attempts}
                {j.customerId ? ` · ${j.customerId}` : ""}
              </div>
              {j.lastError && <div className="mt-1 text-xs text-nt-danger">{j.lastError}</div>}
            </div>
            {(j.status === "dead_letter" || j.status === "failed") && (
              <button
                type="button"
                className="nt-btn-outline text-xs"
                onClick={() =>
                  void portalFetch("/api/csp/jobs/retry", {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ jobId: j.id }),
                  }).then(load)
                }
              >
                Retry
              </button>
            )}
          </div>
        ))}
        {jobs.length === 0 && <div className="nt-card p-6 text-sm text-nt-text-muted">No jobs.</div>}
      </div>
    </div>
  );
}
