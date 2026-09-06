"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/auth/SessionProvider";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";
import clsx from "clsx";

type GdapRow = {
  id: string;
  displayName: string;
  microsoftRelationshipId: string;
  status: string;
  expiresAt?: string;
  remainingDays: number | null;
  roles: Array<{ roleName: string }>;
  customer?: { id: string; name: string; domain: string } | null;
};

export default function AdminGdapPage() {
  const router = useRouter();
  const { isPartner, ready } = useSession();
  const [rows, setRows] = useState<GdapRow[]>([]);

  useEffect(() => {
    if (ready && !isPartner) router.replace("/dashboard");
  }, [ready, isPartner, router]);

  useEffect(() => {
    if (!isPartner) return;
    void portalFetch("/api/csp/gdap")
      .then((r) => r.json())
      .then((d) => setRows(d.relationships || []));
  }, [isPartner]);

  if (!ready || !isPartner) {
    return <div className="p-8 text-sm text-nt-text-muted">Super Admin only…</div>;
  }

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="GDAP relationships"
        subtitle="Status, expiry, remaining days, and Entra roles — not just “GDAP configured”."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((g) => (
          <div key={g.id} className="nt-card space-y-3 p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{g.displayName}</div>
                <div className="text-xs text-nt-text-muted">{g.microsoftRelationshipId}</div>
              </div>
              <span
                className={clsx(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  g.status === "active"
                    ? "bg-nt-success-soft text-nt-success"
                    : "bg-nt-warning-soft text-nt-warning"
                )}
              >
                {g.status}
              </span>
            </div>
            {g.customer && (
              <Link
                href={`/admin/tenants/${g.customer.id}`}
                className="text-xs font-medium text-nt-purple hover:underline"
              >
                {g.customer.name}
              </Link>
            )}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-nt-text-muted">Expires</div>
                <div className="font-semibold">
                  {g.expiresAt ? new Date(g.expiresAt).toLocaleDateString() : "—"}
                </div>
              </div>
              <div>
                <div className="text-nt-text-muted">Remaining</div>
                <div
                  className={clsx(
                    "font-semibold",
                    g.remainingDays != null && g.remainingDays < 30 && "text-nt-danger"
                  )}
                >
                  {g.remainingDays != null ? `${g.remainingDays} days` : "—"}
                </div>
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-nt-text-muted">Roles</div>
              <ul className="space-y-0.5 text-xs">
                {g.roles.map((r) => (
                  <li key={r.roleName}>✓ {r.roleName}</li>
                ))}
              </ul>
            </div>
            <div className="flex gap-3 pt-1 text-xs">
              <button type="button" className="nt-btn-outline py-1.5 text-xs" disabled>
                Review permissions
              </button>
              <button type="button" className="nt-link text-xs" disabled>
                Renew (Phase 2)
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="nt-card p-8 text-sm text-nt-text-muted lg:col-span-2">
            No GDAP relationships yet. Enable GDAP on a tenant to seed a relationship record.
          </div>
        )}
      </div>
    </div>
  );
}
