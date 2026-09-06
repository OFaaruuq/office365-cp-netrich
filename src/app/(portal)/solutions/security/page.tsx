"use client";

import { useEffect, useState } from "react";
import { InspectTenantGate } from "@/hooks/useInspectCustomer";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

type Sec = {
  secureScore: number;
  mfaCoverage: number;
  privilegedUsers: number;
  riskyUsers: number;
  disabledUsers: number;
  staleAccounts: number;
  guestAccounts: number;
  legacyAuth: number;
  adminMfa: number;
  recommendations: Array<{ severity: string; text: string }>;
};

export default function Page() {
  return (
    <InspectTenantGate title="Select a customer for Security Overview">
      {(customerId) => <Body customerId={customerId} />}
    </InspectTenantGate>
  );
}

function Body({ customerId }: { customerId: string }) {
  const [sec, setSec] = useState<Sec | null>(null);
  const [opt, setOpt] = useState<{
    purchased: number;
    assigned: number;
    unused: number;
    potentialSavings: number;
    recommendations: Array<{ product: string; unused: number; saving: number }>;
  } | null>(null);
  useEffect(() => {
    void portalFetch(`/api/csp/security?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then((d) => setSec(d.security));
    void portalFetch(`/api/csp/license-optimization?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then(setOpt);
  }, [customerId]);
  return (
    <div className="nt-fade-in">
      <AdminHero title="Security Center" subtitle="Secure Score, MFA coverage, risks, and license optimization." />
      {sec && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Secure Score", `${sec.secureScore}%`],
              ["MFA coverage", `${sec.mfaCoverage}%`],
              ["Privileged users", sec.privilegedUsers],
              ["Risky users", sec.riskyUsers],
              ["Disabled users", sec.disabledUsers],
              ["Stale accounts", sec.staleAccounts],
              ["Guest accounts", sec.guestAccounts],
              ["Admin MFA", `${sec.adminMfa}%`],
            ].map(([l, v]) => (
              <div key={String(l)} className="nt-card p-3">
                <div className="text-[11px] text-nt-text-muted">{l}</div>
                <div className="text-lg font-bold">{v}</div>
              </div>
            ))}
          </div>
          <div className="nt-card mb-4 p-4">
            <div className="mb-2 text-sm font-semibold">Recommendations</div>
            <ul className="space-y-1 text-sm">
              {sec.recommendations.map((r, i) => (
                <li key={i}>
                  <span className="font-semibold text-nt-danger">{r.severity}</span> {r.text}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      {opt && (
        <div className="nt-card p-4">
          <div className="mb-2 text-sm font-semibold">License optimization</div>
          <div className="text-sm text-nt-text-muted">
            Purchased {opt.purchased} · Assigned {opt.assigned} · Unused {opt.unused} · Potential savings $
            {opt.potentialSavings.toFixed(2)}/mo
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {opt.recommendations.map((r, i) => (
              <li key={i}>
                {r.product}: {r.unused} unused · ${r.saving}/mo
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
