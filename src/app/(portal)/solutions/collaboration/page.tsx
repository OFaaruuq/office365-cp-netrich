"use client";

import Link from "next/link";
import { MessageSquare, Users, Video } from "lucide-react";
import { useTenantWorkspace } from "@/hooks/useTenantWorkspace";

export default function CollaborationPage() {
  const { loading, error, workspace, needsCustomerPick, user } = useTenantWorkspace();

  if (loading) {
    return <div className="text-sm text-nt-text-muted">Loading tenant collaboration…</div>;
  }

  if (needsCustomerPick) {
    return (
      <div className="nt-card max-w-lg p-6">
        <h1 className="text-lg font-semibold">Select a client tenant</h1>
        <p className="mt-2 text-sm text-nt-text-muted">
          Collaboration metrics are isolated per tenant.
        </p>
        <Link href="/admin/tenants" className="nt-btn-primary mt-4 inline-flex">
          Open Tenants
        </Link>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="rounded-xl border border-nt-danger/30 bg-nt-danger-soft px-4 py-3 text-sm text-nt-danger">
        {error || "Collaboration workspace unavailable"}
      </div>
    );
  }

  const collab = workspace.solutions?.collaboration || {
    teamsActiveUsers: 0,
    sharePointSites: 0,
    meetings30d: 0,
  };

  const tools = [
    {
      title: "Microsoft Teams",
      description: "Chat, meetings, calling, and collaboration for your workforce.",
      icon: MessageSquare,
      metric: `${collab.teamsActiveUsers} active users`,
    },
    {
      title: "SharePoint Online",
      description: "Intranet, document libraries, and team sites.",
      icon: Users,
      metric: `${collab.sharePointSites} sites`,
    },
    {
      title: "Microsoft Stream / Meetings",
      description: "Video meetings and recorded content across your organization.",
      icon: Video,
      metric: `${collab.meetings30d} meetings (30d)`,
    },
  ];

  return (
    <div className="nt-fade-in">
      <h1 className="nt-page-title">Collaboration Tools</h1>
      <p className="mb-2 max-w-2xl text-sm leading-relaxed text-nt-text-muted">
        Isolated collaboration posture for{" "}
        <strong className="text-nt-purple">
          {user?.customerName || workspace.name || workspace.customerId}
        </strong>
        . Metrics never mix with other client tenants.
      </p>
      <p className="mb-6 text-xs text-nt-text-subtle">{workspace.domain}</p>
      <div className="grid gap-4 md:grid-cols-3">
        {tools.map((t) => {
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
                Browse products
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
