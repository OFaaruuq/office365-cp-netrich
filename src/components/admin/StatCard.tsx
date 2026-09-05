import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

type Props = {
  label: string;
  value: number | string;
  icon: LucideIcon;
  href?: string;
  tone?: "purple" | "success" | "warning" | "danger" | "blue" | "muted";
  hint?: string;
};

const TONE: Record<NonNullable<Props["tone"]>, string> = {
  purple: "text-nt-purple bg-nt-purple-soft",
  success: "text-nt-success bg-nt-success-soft",
  warning: "text-nt-warning bg-nt-warning-soft",
  danger: "text-nt-danger bg-nt-danger-soft",
  blue: "text-nt-blue bg-nt-blue-soft",
  muted: "text-nt-text-muted bg-nt-surface-muted",
};

export function StatCard({ label, value, icon: Icon, href, tone = "purple", hint }: Props) {
  const body = (
    <div
      className={clsx(
        "nt-card p-4 sm:p-5",
        href && "nt-card-interactive cursor-pointer"
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold tracking-wide text-nt-text-subtle uppercase">
          {label}
        </span>
        <span className={clsx("inline-flex rounded-lg p-2", TONE[tone])}>
          <Icon size={16} />
        </span>
      </div>
      <div className="text-2xl font-semibold tracking-tight text-nt-text">{value}</div>
      {hint && <div className="mt-1 text-xs text-nt-text-muted">{hint}</div>}
    </div>
  );

  if (href) return <Link href={href}>{body}</Link>;
  return body;
}
