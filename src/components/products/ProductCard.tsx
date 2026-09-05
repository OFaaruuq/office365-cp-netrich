import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { Subscription } from "@/lib/types";

export default function ProductCard({ subscription }: { subscription: Subscription }) {
  const usagePct =
    subscription.purchased > 0
      ? Math.round((subscription.used / subscription.purchased) * 100)
      : 0;

  return (
    <div className="nt-card nt-fade-in flex flex-col overflow-hidden">
      <div className="border-b border-nt-border p-5 md:p-6">
        <div className="flex items-start gap-2">
          <h3 className="text-[15px] font-semibold tracking-tight text-nt-text">
            {subscription.name}
          </h3>
          {subscription.hasAlert && (
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-nt-danger-soft">
              <AlertCircle size={14} className="text-nt-danger" />
            </span>
          )}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-nt-text-muted">
          {subscription.description}
        </p>
        <button type="button" className="nt-link mt-2">
          Click for more information...
        </button>
      </div>

      <div className="flex-1 p-5 md:p-6">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-bold tracking-wide text-nt-text-subtle uppercase">
            License Overview
          </span>
          <span className="rounded-full bg-nt-blue-soft px-2.5 py-0.5 font-semibold text-nt-blue">
            {usagePct}% Used
          </span>
        </div>
        <div className="mb-5 h-2.5 overflow-hidden rounded-full bg-nt-blue-soft">
          <div
            className="h-full rounded-full bg-gradient-to-r from-nt-blue to-[#3aa0f3] transition-all"
            style={{ width: `${usagePct}%` }}
          />
        </div>
        <div className="mb-5 grid grid-cols-3 gap-2 text-center">
          {[
            ["Purchased", subscription.purchased],
            ["Used", subscription.used],
            ["Available", subscription.available],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl bg-nt-surface-muted px-2 py-3">
              <div className="text-[10px] font-bold tracking-wide text-nt-text-subtle uppercase">
                {label}
              </div>
              <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-nt-border bg-nt-surface-muted/70 p-4">
          <div className="mb-3 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-nt-text ring-1 ring-nt-border">
            {subscription.billingCycle}
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-nt-text-subtle">Annual Commitment</div>
              <div className="mt-1 font-semibold text-nt-text">
                ${subscription.price.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-nt-text-subtle">Next Renewal</div>
              <div className="mt-1 font-semibold text-nt-text">
                {format(parseISO(subscription.nextRenewal), "EEE MMM d yyyy")}
              </div>
            </div>
            <div>
              <div className="text-nt-text-subtle">Sub Total</div>
              <div className="mt-1 font-semibold text-nt-text">
                ${subscription.price.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-nt-border p-4">
        <Link
          href="/catalog/microsoft-365"
          className="nt-btn-secondary flex w-full items-center justify-center rounded-xl"
        >
          Manage Subscriptions
        </Link>
      </div>
    </div>
  );
}
