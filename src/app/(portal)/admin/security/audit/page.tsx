"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/auth/SessionProvider";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

export default function AdminAuditPage() {
  const router = useRouter();
  const { isPartner, ready } = useSession();
  const [events, setEvents] = useState<
    Array<{ id: string; at: string; action: string; actorEmail: string; detail?: string; customerId?: string }>
  >([]);

  useEffect(() => {
    if (ready && !isPartner) router.replace("/dashboard");
  }, [ready, isPartner, router]);

  useEffect(() => {
    if (!isPartner) return;
    void portalFetch("/api/csp/audit?limit=80")
      .then((r) => r.json())
      .then((d) => setEvents(d.events || []));
  }, [isPartner]);

  if (!ready || !isPartner) {
    return <div className="p-8 text-sm text-nt-text-muted">Super Admin only…</div>;
  }

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Audit logs"
        subtitle="Compliance trail for tenant, user, MFA, and view-as-customer actions. NestJS expands fields (request_id, actor_type, risk_level)."
      />
      <div className="nt-card overflow-hidden">
        <ul className="max-h-[70vh] divide-y divide-nt-border overflow-y-auto nt-scroll">
          {events.map((e) => (
            <li key={e.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-nt-purple">{e.action}</span>
                <span className="text-[11px] text-nt-text-muted">
                  {e.at ? new Date(e.at).toLocaleString() : ""}
                </span>
              </div>
              <div className="text-xs text-nt-text-muted">
                {e.actorEmail}
                {e.customerId ? ` · ${e.customerId}` : ""}
                {e.detail ? ` · ${e.detail}` : ""}
              </div>
            </li>
          ))}
          {events.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-nt-text-muted">No audit events yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
