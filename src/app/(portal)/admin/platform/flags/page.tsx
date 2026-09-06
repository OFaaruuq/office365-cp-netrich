"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/auth/SessionProvider";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";
import clsx from "clsx";

export default function FeatureFlagsPage() {
  const router = useRouter();
  const { isPartner, ready } = useSession();
  const [flags, setFlags] = useState<
    Array<{ key: string; description: string; enabled: boolean }>
  >([]);

  useEffect(() => {
    if (ready && !isPartner) router.replace("/dashboard");
  }, [ready, isPartner, router]);

  useEffect(() => {
    if (!isPartner) return;
    void portalFetch("/api/csp/flags")
      .then((r) => r.json())
      .then((d) => setFlags(d.flags || []));
  }, [isPartner]);

  if (!ready || !isPartner) {
    return <div className="p-8 text-sm text-nt-text-muted">Super Admin only…</div>;
  }

  return (
    <div className="nt-fade-in">
      <AdminHero title="Feature flags" subtitle="Global / environment gates for CSP modules." />
      <div className="nt-card divide-y divide-nt-border">
        {flags.map((f) => (
          <div key={f.key} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="text-sm font-semibold">{f.key}</div>
              <div className="text-xs text-nt-text-muted">{f.description}</div>
            </div>
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                f.enabled ? "bg-nt-success-soft text-nt-success" : "bg-nt-surface-muted text-nt-text-muted"
              )}
            >
              {f.enabled ? "On" : "Off"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
