"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/auth/SessionProvider";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";
import clsx from "clsx";

export default function IntegrationHealthPage() {
  const router = useRouter();
  const { isPartner, ready } = useSession();
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [sam, setSam] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (ready && !isPartner) router.replace("/dashboard");
  }, [ready, isPartner, router]);

  useEffect(() => {
    if (!isPartner) return;
    void Promise.all([
      portalFetch("/api/csp/health").then((r) => r.json()),
      portalFetch("/api/csp/microsoft/integration").then((r) => r.json()),
    ]).then(([h, s]) => {
      setHealth(h);
      setSam(s);
    });
  }, [isPartner]);

  if (!ready || !isPartner) {
    return <div className="p-8 text-sm text-nt-text-muted">Super Admin only…</div>;
  }

  const components = (sam?.components as Array<{ component: string; status: string; detail?: string }>) || [];

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Integration health"
        subtitle="Platform + Secure Application Model status. Partner Center writes stay disabled until Phase 2."
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[
          { label: "API stage", value: String(health?.stage || "foundation") },
          { label: "PostgreSQL", value: String(health?.postgres || "—") },
          { label: "Redis", value: String(health?.redis || "—") },
          { label: "Workers", value: String(health?.workers || "—") },
          { label: "Source", value: String(health?.source || "—") },
          { label: "PC writes", value: sam?.partnerCenterWritesEnabled ? "enabled" : "disabled" },
        ].map((c) => (
          <div key={c.label} className="nt-card p-4">
            <div className="text-[11px] font-semibold uppercase text-nt-text-muted">{c.label}</div>
            <div className="mt-1 text-sm font-semibold">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="nt-card mt-4 p-5">
        <div className="mb-3 text-sm font-semibold">Microsoft integration</div>
        <p className="mb-4 text-xs text-nt-text-muted">{String(sam?.authStrategy || "")}</p>
        <ul className="space-y-2">
          {components.map((c) => (
            <li
              key={c.component}
              className="flex items-center justify-between rounded-lg border border-nt-border px-3 py-2 text-sm"
            >
              <span className="font-medium">{c.component}</span>
              <span
                className={clsx(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  c.status === "healthy"
                    ? "bg-nt-success-soft text-nt-success"
                    : "bg-nt-surface-muted text-nt-text-muted"
                )}
              >
                {c.status}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-nt-text-muted">
          Start Nest API: <code className="text-nt-purple">cd backend && npm run docker:up && npm run dev:api</code>
        </p>
      </div>
    </div>
  );
}
