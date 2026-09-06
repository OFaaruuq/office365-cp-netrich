"use client";

import { useEffect, useState } from "react";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

export default function Page() {
  const [sessions, setSessions] = useState<
    Array<{ id: string; ip: string; userAgent: string; lastSeen: string; current?: boolean }>
  >([]);
  async function load() {
    const d = await portalFetch("/api/csp/sessions").then((r) => r.json());
    setSessions(d.sessions || []);
  }
  useEffect(() => {
    void portalFetch("/api/csp/sessions/track", { method: "POST", body: "{}" }).finally(() => void load());
  }, []);
  async function revoke(id: string) {
    await portalFetch(`/api/csp/sessions/${id}/revoke`, { method: "PATCH", body: "{}" });
    await load();
  }
  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Active sessions"
        subtitle="Sign out individual devices or all sessions."
        actions={
          <button type="button" className="nt-btn-on-brand text-xs" onClick={() => void revoke("all")}>
            Sign out all
          </button>
        }
      />
      <div className="space-y-2">
        {sessions.map((s) => (
          <div key={s.id} className="nt-card flex items-center justify-between gap-2 p-4">
            <div>
              <div className="font-semibold">{s.current ? "Current session" : "Session"}</div>
              <div className="text-xs text-nt-text-muted">
                {s.ip} · {s.userAgent.slice(0, 80)}
              </div>
              <div className="text-[11px] text-nt-text-subtle">Last active {new Date(s.lastSeen).toLocaleString()}</div>
            </div>
            {!s.current && (
              <button type="button" className="text-xs font-semibold text-nt-danger" onClick={() => void revoke(s.id)}>
                Sign out
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
