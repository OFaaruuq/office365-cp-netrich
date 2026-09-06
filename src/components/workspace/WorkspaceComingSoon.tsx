"use client";

import { AdminHero } from "@/components/admin/AdminHero";

export default function WorkspaceComingSoon({
  title = "Coming soon",
  subtitle = "This customer workspace module ships with Microsoft Connected / Full CSP stages.",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="nt-fade-in">
      <AdminHero title={title} subtitle={subtitle} />
      <div className="nt-card p-6 text-sm text-nt-text-muted">
        Foundation navigation is live. Live Graph / Partner Center data arrives in Phase 2+.
      </div>
    </div>
  );
}
