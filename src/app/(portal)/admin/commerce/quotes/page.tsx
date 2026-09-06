"use client";

import { useEffect, useState } from "react";
import { portalFetch, useSuperAdminHeaders } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

type Quote = {
  id: string;
  customerId: string;
  status: string;
  currency: string;
  items: Array<{ name: string; qty: number; unitPrice: number }>;
  updatedAt: string;
};

export default function Page() {
  const headers = useSuperAdminHeaders();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  async function load() {
    const d = await portalFetch("/api/csp/quotes").then((r) => r.json());
    setQuotes(d.quotes || []);
  }
  useEffect(() => {
    void load();
  }, []);
  async function setStatus(id: string, status: string) {
    await portalFetch(`/api/csp/quotes/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status }),
    });
    await load();
  }
  return (
    <div className="nt-fade-in">
      <AdminHero title="Quotes" subtitle="Configure → quote → approval → order (Foundation local SoR)." />
      <div className="space-y-3">
        {quotes.map((q) => {
          const total = q.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
          return (
            <div key={q.id} className="nt-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{q.id}</div>
                  <div className="text-xs text-nt-text-muted">
                    {q.customerId} · {q.status} · {q.currency} {total.toFixed(2)}
                  </div>
                </div>
                <div className="flex gap-2">
                  {q.status === "draft" && (
                    <button type="button" className="nt-btn-outline text-xs" onClick={() => void setStatus(q.id, "sent")}>
                      Send
                    </button>
                  )}
                  {q.status === "sent" && (
                    <button type="button" className="nt-btn-primary text-xs" onClick={() => void setStatus(q.id, "approved")}>
                      Mark approved
                    </button>
                  )}
                  {q.status === "approved" && (
                    <button type="button" className="nt-btn-primary text-xs" onClick={() => void setStatus(q.id, "ordered")}>
                      Convert to order
                    </button>
                  )}
                </div>
              </div>
              <ul className="mt-2 text-sm text-nt-text-muted">
                {q.items.map((i, idx) => (
                  <li key={idx}>
                    {i.qty} × {i.name} @ ${i.unitPrice}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {quotes.length === 0 && <div className="nt-card p-6 text-sm text-nt-text-muted">No quotes yet.</div>}
      </div>
    </div>
  );
}
