"use client";

import { useEffect, useState } from "react";
import { portalFetch, useSuperAdminHeaders } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

type Approval = {
  id: string;
  operation: string;
  customerId?: string;
  requesterEmail: string;
  status: string;
  createdAt: string;
  approverEmail?: string;
};

export default function Page() {
  const headers = useSuperAdminHeaders();
  const [rows, setRows] = useState<Approval[]>([]);
  async function load() {
    const d = await portalFetch("/api/csp/approvals").then((r) => r.json());
    setRows(d.approvals || []);
  }
  useEffect(() => {
    void load();
  }, []);
  async function decide(id: string, decision: "approved" | "rejected") {
    await portalFetch(`/api/csp/approvals/${id}/decide`, {
      method: "POST",
      headers,
      body: JSON.stringify({ decision }),
    });
    await load();
  }
  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Privileged approvals"
        subtitle="Four-eyes for terminate / GDAP / destructive commerce. Requester cannot self-approve."
      />
      <div className="space-y-2">
        {rows.map((a) => (
          <div key={a.id} className="nt-card flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <div className="font-semibold">{a.operation}</div>
              <div className="text-xs text-nt-text-muted">
                {a.status} · {a.requesterEmail}
                {a.customerId ? ` · ${a.customerId}` : ""}
                {a.approverEmail ? ` · approved by ${a.approverEmail}` : ""}
              </div>
              <div className="text-[11px] text-nt-text-subtle">{a.id}</div>
            </div>
            {a.status === "pending" && (
              <div className="flex gap-2">
                <button type="button" className="nt-btn-primary text-xs" onClick={() => void decide(a.id, "approved")}>
                  Approve
                </button>
                <button type="button" className="nt-btn-outline text-xs" onClick={() => void decide(a.id, "rejected")}>
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="nt-card p-6 text-sm text-nt-text-muted">No approval requests.</div>}
      </div>
    </div>
  );
}
