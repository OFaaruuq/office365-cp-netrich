import clsx from "clsx";
import type { CustomerStatus } from "@/lib/tenancy-types";

const STYLES: Record<CustomerStatus, string> = {
  active: "bg-nt-success-soft text-nt-success ring-nt-success/20",
  pending: "bg-nt-warning-soft text-nt-warning ring-nt-warning/25",
  suspended: "bg-nt-danger-soft text-nt-danger ring-nt-danger/20",
  rejected: "bg-nt-surface-muted text-nt-text-muted ring-nt-border",
};

export function StatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase ring-1",
        STYLES[status]
      )}
    >
      {status}
    </span>
  );
}

export function PortalAccessBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 text-xs font-semibold",
        enabled ? "text-nt-success" : "text-nt-text-muted"
      )}
    >
      <span
        className={clsx(
          "h-1.5 w-1.5 rounded-full",
          enabled ? "bg-nt-success" : "bg-nt-border-strong"
        )}
      />
      {enabled ? "Enabled" : "Locked"}
    </span>
  );
}
