"use client";

import { useEffect, useState } from "react";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

export default function Page() {
  const [packs, setPacks] = useState<
    Array<{ key: string; name: string; scope: string; permissions: string[] }>
  >([]);
  const [permissions, setPermissions] = useState<Array<{ key: string; description: string }>>([]);
  const [legacy, setLegacy] = useState<Record<string, string>>({});

  useEffect(() => {
    void portalFetch("/api/csp/rbac/roles")
      .then((r) => r.json())
      .then((d) => {
        setPacks(d.packs || []);
        setPermissions(d.permissions || []);
        setLegacy(d.legacyRoleMap || {});
      });
  }, []);

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Roles & permissions"
        subtitle="RBAC packs mapped from legacy portal roles. Privileged ops use four-eyes Approvals."
      />
      <div className="mb-6 grid gap-3 lg:grid-cols-2">
        {packs.map((p) => (
          <div key={p.key} className="nt-card p-4">
            <div className="font-semibold">{p.name}</div>
            <div className="text-[11px] text-nt-text-muted">
              {p.key} · {p.scope}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {p.permissions.map((perm) => (
                <span
                  key={perm}
                  className="rounded-full bg-nt-surface-muted px-2 py-0.5 text-[10px] font-medium"
                >
                  {perm}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="nt-card mb-4 p-4 text-sm">
        <div className="mb-2 font-semibold">Legacy role map</div>
        <pre className="overflow-auto text-xs text-nt-text-muted">{JSON.stringify(legacy, null, 2)}</pre>
      </div>
      <div className="nt-card p-4">
        <div className="mb-2 text-sm font-semibold">Permission catalog ({permissions.length})</div>
        <ul className="columns-1 gap-4 text-xs text-nt-text-muted md:columns-2">
          {permissions.map((p) => (
            <li key={p.key} className="mb-1 break-inside-avoid">
              <span className="font-semibold text-nt-text">{p.key}</span> — {p.description}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
