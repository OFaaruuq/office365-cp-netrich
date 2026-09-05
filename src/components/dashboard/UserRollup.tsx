import Link from "next/link";
import { Check, Clock, AlertTriangle, X } from "lucide-react";
import type { UserRollup } from "@/lib/types";

const items = [
  {
    key: "active" as const,
    label: "Active Users",
    icon: Check,
    iconBg: "bg-[#107c10]",
    border: "border-t-[#107c10]",
  },
  {
    key: "pending" as const,
    label: "Pending Users",
    icon: Clock,
    iconBg: "bg-[#8a8886]",
    border: "border-t-[#8a8886]",
  },
  {
    key: "blocked" as const,
    label: "Blocked Users",
    icon: AlertTriangle,
    iconBg: "bg-[#d83b01]",
    border: "border-t-[#ffaa44]",
  },
  {
    key: "error" as const,
    label: "Users with error",
    icon: X,
    iconBg: "bg-[#d13438]",
    border: "border-t-[#d13438]",
  },
];

export default function UserRollupCard({ rollup }: { rollup: UserRollup }) {
  return (
    <div className="nt-card p-5 md:p-6">
      <h2 className="nt-section-label">User Rollup</h2>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.key}
              className={`rounded-xl border border-nt-border border-t-[3px] ${item.border} bg-white p-4 text-center transition hover:shadow-sm`}
            >
              <div className="mb-3 flex justify-center">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-white shadow-sm ${item.iconBg}`}
                >
                  <Icon size={15} strokeWidth={2.75} />
                </span>
              </div>
              <div className="text-[28px] font-semibold leading-none tracking-tight text-nt-text">
                {rollup[item.key]}
              </div>
              <div className="mt-2 text-xs font-medium text-nt-text-muted">{item.label}</div>
              <Link href="/users" className="nt-link mt-3 inline-block text-xs">
                View All
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
