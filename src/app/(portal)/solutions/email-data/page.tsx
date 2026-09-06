"use client";

import Link from "next/link";
import { Database, Mail, HardDrive } from "lucide-react";
import { useTenantWorkspace } from "@/hooks/useTenantWorkspace";

export default function EmailDataPage() {
  const { loading, error, workspace, needsCustomerPick, user } = useTenantWorkspace();

  if (loading) {
    return <div className="text-sm text-nt-text-muted">Loading tenant email & data…</div>;
  }

  if (needsCustomerPick) {
    return (
      <div className="nt-card max-w-lg p-6">
        <h1 className="text-lg font-semibold">Select a client tenant</h1>
        <p className="mt-2 text-sm text-nt-text-muted">
          Email and data metrics are isolated per tenant.
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
        {error || "Email & data workspace unavailable"}
      </div>
    );
  }

  const email = workspace.solutions?.emailData || {
    mailboxes: 0,
    oneDriveGB: 0,
    sharePointGB: 0,
  };

  const items = [
    {
      title: "Exchange Online",
      description: "Business email, calendars, and contacts hosted in Microsoft 365.",
      icon: Mail,
      metric: `${email.mailboxes} mailboxes`,
    },
    {
      title: "OneDrive for Business",
      description: "Personal cloud storage with enterprise security and sharing controls.",
      icon: HardDrive,
      metric: `${email.oneDriveGB} GB used`,
    },
    {
      title: "SharePoint & Lists",
      description: "Structured data and document management for teams.",
      icon: Database,
      metric: `${email.sharePointGB} GB site storage`,
    },
  ];

  return (
    <div className="nt-fade-in">
      <h1 className="nt-page-title">Email And Data</h1>
      <p className="mb-2 max-w-2xl text-sm leading-relaxed text-nt-text-muted">
        Isolated email & data posture for{" "}
        <strong className="text-nt-purple">
          {user?.customerName || workspace.name || workspace.customerId}
        </strong>
        . Storage and mailbox counts never mix with other tenants.
      </p>
      <p className="mb-6 text-xs text-nt-text-subtle">{workspace.domain}</p>
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.title} className="nt-card group p-6 transition hover:-translate-y-0.5">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-nt-purple text-white">
                <Icon size={20} />
              </div>
              <h2 className="font-semibold tracking-tight">{t.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-nt-text-muted">{t.description}</p>
              <div className="mt-3 text-xs font-semibold text-nt-purple">{t.metric}</div>
              <Link href="/catalog/microsoft-365" className="nt-link mt-4 inline-block">
                View catalog
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
