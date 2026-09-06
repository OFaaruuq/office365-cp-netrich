"use client";

import Link from "next/link";
import { InspectTenantGate } from "@/hooks/useInspectCustomer";
import RenewalCalendar from "@/components/dashboard/RenewalCalendar";
import UserRollupCard from "@/components/dashboard/UserRollup";
import HelpResources from "@/components/dashboard/HelpResources";
import ProductRecommendations from "@/components/dashboard/ProductRecommendations";
import PurchasedLicenses from "@/components/dashboard/PurchasedLicenses";
import { useTenantWorkspace } from "@/hooks/useTenantWorkspace";

function DashboardBody({ customerId }: { customerId: string }) {
  const { loading, error, workspace, user, isClient } = useTenantWorkspace(customerId);

  if (loading) {
    return <div className="text-sm text-nt-text-muted">Loading isolated tenant workspace…</div>;
  }

  if (error || !workspace) {
    return (
      <div className="rounded-xl border border-nt-danger/30 bg-nt-danger-soft px-4 py-3 text-sm text-nt-danger">
        {error || "Tenant workspace unavailable"}
      </div>
    );
  }

  return (
    <div className="nt-fade-in">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="nt-page-title mb-0">Microsoft 365 Overview</h1>
          <p className="mt-1 text-xs text-nt-text-muted">
            Isolated workspace ·{" "}
            <strong className="text-nt-purple">
              {user?.customerName || workspace.name || workspace.customerId}
            </strong>
            {isClient ? " · your tenant only" : " · Super Admin inspection"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:gap-5 xl:grid-cols-3">
        <div className="flex flex-col gap-4 lg:gap-5 xl:col-span-2">
          <RenewalCalendar renewals={workspace.renewals} />
          <UserRollupCard rollup={workspace.userRollup} />
          <PurchasedLicenses subscriptions={workspace.subscriptions} />
        </div>
        <div className="flex flex-col gap-3 lg:gap-4">
          <HelpResources />
          <ProductRecommendations items={workspace.recommendations} />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <InspectTenantGate title="Select a client tenant to inspect">
      {(customerId) => <DashboardBody customerId={customerId} />}
    </InspectTenantGate>
  );
}
