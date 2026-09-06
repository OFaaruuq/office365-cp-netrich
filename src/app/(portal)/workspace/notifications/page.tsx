"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

export default function Page() {
  const [rows, setRows] = useState<
    Array<{ id: string; title: string; message: string; severity: string; actionUrl?: string; readAt?: string }>
  >([]);
  const [prefs, setPrefs] = useState<Record<string, string[]> | null>(null);
  async function load() {
    const [n, p] = await Promise.all([
      portalFetch("/api/csp/notifications").then((r) => r.json()),
      portalFetch("/api/csp/notification-prefs").then((r) => r.json()),
    ]);
    setRows(n.notifications || []);
    setPrefs(p.preferences || null);
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="nt-fade-in">
      <AdminHero title="Notifications" subtitle="Portal alerts for renewals, GDAP, security, and sync." />
      <div className="mb-4 space-y-2">
        {rows.map((n) => (
          <div key={n.id} className="nt-card flex items-start justify-between gap-2 p-4">
            <div>
              <div className="font-semibold">{n.title}</div>
              <div className="text-sm text-nt-text-muted">{n.message}</div>
              {n.actionUrl && (
                <Link href={n.actionUrl} className="nt-link text-xs">
                  Open
                </Link>
              )}
            </div>
            {!n.readAt && (
              <button
                type="button"
                className="text-xs font-semibold text-nt-purple"
                onClick={() =>
                  void portalFetch(`/api/csp/notifications/${n.id}/read`, { method: "PATCH", body: "{}" }).then(load)
                }
              >
                Mark read
              </button>
            )}
          </div>
        ))}
      </div>
      {prefs && (
        <div className="nt-card p-4 text-sm">
          <div className="mb-2 font-semibold">Preferences</div>
          <pre className="overflow-auto text-xs text-nt-text-muted">{JSON.stringify(prefs, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
