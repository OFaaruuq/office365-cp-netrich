"use client";

import Link from "next/link";
import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { useTenantWorkspace } from "@/hooks/useTenantWorkspace";

export default function SecurityReportPage() {
  const { loading, error, workspace, needsCustomerPick, user } = useTenantWorkspace();

  if (loading) {
    return <div className="text-sm text-nt-text-muted">Loading tenant security posture…</div>;
  }

  if (needsCustomerPick) {
    return (
      <div className="nt-card max-w-lg p-6">
        <h1 className="text-lg font-semibold">Select a client tenant</h1>
        <p className="mt-2 text-sm text-nt-text-muted">
          Security metrics are isolated per tenant.
        </p>
        <Link href="/admin/customers" className="nt-btn-primary mt-4 inline-flex">
          Open Client Tenants
        </Link>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="rounded-xl border border-nt-danger/30 bg-nt-danger-soft px-4 py-3 text-sm text-nt-danger">
        {error || "Security posture unavailable"}
      </div>
    );
  }

  const posture = workspace.securityPosture || {
    mfaPercent: 0,
    threatEvents30d: 0,
    secureScore: 0,
    lastAssessedAt: "",
  };

  const reports = [
    {
      title: "Identity Health",
      value: `${posture.mfaPercent}%`,
      detail: "Users with MFA enabled (this tenant only)",
      icon: ShieldCheck,
      tone: "from-nt-success-soft to-white border-nt-success/20",
    },
    {
      title: "Threat Protection",
      value: String(posture.threatEvents30d),
      detail: "Malware / phishing events (30 days) · isolated",
      icon: ShieldAlert,
      tone: "from-nt-warning-soft to-white border-nt-warning/20",
    },
    {
      title: "Secure Score",
      value: String(posture.secureScore),
      detail: "Microsoft Secure Score sample for this tenant",
      icon: Shield,
      tone: "from-nt-purple-soft to-white border-nt-purple/20",
    },
  ];

  return (
    <div className="nt-fade-in">
      <h1 className="nt-page-title">Security Report</h1>
      <p className="mb-2 max-w-2xl text-sm leading-relaxed text-nt-text-muted">
        Isolated security posture for{" "}
        <strong className="text-nt-purple">{user?.customerName || workspace.name || workspace.customerId}</strong>
        . Metrics never mix with other client tenants.
      </p>
      {posture.lastAssessedAt && (
        <p className="mb-6 text-xs text-nt-text-subtle">
          Last assessed {new Date(posture.lastAssessedAt).toLocaleString()}
        </p>
      )}
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {reports.map((r) => {
          const Icon = r.icon;
          return (
            <div
              key={r.title}
              className={`nt-card border bg-gradient-to-br p-6 ${r.tone}`}
            >
              <div className="mb-3 flex items-center gap-2 text-nt-purple">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-xs ring-1 ring-nt-border">
                  <Icon size={18} />
                </span>
                <span className="text-sm font-semibold text-nt-text">{r.title}</span>
              </div>
              <div className="text-3xl font-semibold tracking-tight">{r.value}</div>
              <p className="mt-1 text-xs text-nt-text-muted">{r.detail}</p>
            </div>
          );
        })}
      </div>
      <Link href="/catalog/microsoft-365" className="nt-btn-primary inline-flex">
        Explore security products
      </Link>
    </div>
  );
}
