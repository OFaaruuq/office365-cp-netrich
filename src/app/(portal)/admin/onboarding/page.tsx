"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/auth/SessionProvider";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";
import clsx from "clsx";

type Row = {
  id: string;
  name: string;
  domain: string;
  status: string;
  onboarding?: { completed: number; total: number; percent: number; steps: Array<{ key: string; completed: boolean }> };
};

export default function AdminOnboardingPage() {
  const router = useRouter();
  const { isPartner, ready } = useSession();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (ready && !isPartner) router.replace("/dashboard");
  }, [ready, isPartner, router]);

  useEffect(() => {
    if (!isPartner) return;
    void portalFetch("/api/csp/customers")
      .then((r) => r.json())
      .then((d) => setRows(d.customers || []));
  }, [isPartner]);

  if (!ready || !isPartner) {
    return <div className="p-8 text-sm text-nt-text-muted">Super Admin only…</div>;
  }

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Customer onboarding"
        subtitle="12-step Microsoft CSP onboarding progress — beyond Pending/Active."
      />
      <div className="space-y-4">
        {rows.map((c) => (
          <div key={c.id} className="nt-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/admin/tenants/${c.id}`} className="text-sm font-semibold text-nt-purple hover:underline">
                  {c.name}
                </Link>
                <div className="text-xs text-nt-text-muted">
                  {c.domain} · {c.status}
                </div>
              </div>
              <div className="text-right text-xs font-semibold text-nt-text">
                {c.onboarding?.completed ?? 0} / {c.onboarding?.total ?? 12} · {c.onboarding?.percent ?? 0}%
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-nt-surface-muted">
              <div
                className="h-full rounded-full bg-nt-purple"
                style={{ width: `${c.onboarding?.percent ?? 0}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(c.onboarding?.steps || []).map((s) => (
                <span
                  key={s.key}
                  className={clsx(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    s.completed
                      ? "bg-nt-success-soft text-nt-success"
                      : "bg-nt-surface-muted text-nt-text-muted"
                  )}
                >
                  {s.completed ? "✓ " : "○ "}
                  {s.key.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="nt-card p-8 text-center text-sm text-nt-text-muted">No customers yet.</div>
        )}
      </div>
    </div>
  );
}
