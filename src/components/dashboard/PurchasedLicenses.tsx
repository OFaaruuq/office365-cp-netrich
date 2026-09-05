"use client";

import Link from "next/link";
import { Download, Info } from "lucide-react";
import type { Subscription } from "@/lib/types";

const COLORS = ["#5b9bd5", "#2f6fed", "#7a45b5", "#20a8b0"];

export default function PurchasedLicenses({
  subscriptions = [],
}: {
  subscriptions?: Subscription[];
}) {
  const total = subscriptions.reduce((sum, s) => sum + s.purchased, 0) || 1;
  let offset = 0;
  const segments = subscriptions.map((s, i) => {
    const pct = (s.purchased / total) * 100;
    const dash = (pct / 100) * 100;
    const seg = {
      ...s,
      color: COLORS[i % COLORS.length],
      dasharray: `${dash} ${100 - dash}`,
      dashoffset: 25 - offset,
    };
    offset += dash;
    return seg;
  });

  return (
    <div className="nt-card nt-fade-in p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="nt-section-label mb-0">Purchased Licenses</h2>
          <Info size={14} className="text-nt-text-subtle" />
        </div>
        <button
          type="button"
          className="nt-link inline-flex items-center gap-1.5 text-xs font-semibold"
        >
          <Download size={13} />
          Download Report
        </button>
      </div>

      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <div className="relative h-40 w-40 shrink-0">
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
            <circle
              cx="18"
              cy="18"
              r="15.915"
              fill="none"
              stroke="#e8f1fa"
              strokeWidth="4"
            />
            {segments.map((seg) => (
              <circle
                key={seg.id}
                cx="18"
                cy="18"
                r="15.915"
                fill="none"
                stroke={seg.color}
                strokeWidth="4"
                strokeDasharray={seg.dasharray}
                strokeDashoffset={seg.dashoffset}
                strokeLinecap="butt"
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-2xl font-semibold tracking-tight text-nt-text">{total}</div>
            <div className="text-[10px] font-semibold tracking-wide text-nt-text-subtle uppercase">
              Licenses
            </div>
          </div>
        </div>

        <div className="w-full flex-1 space-y-3">
          {segments.map((seg) => (
            <div
              key={seg.id}
              className="flex items-start gap-3 rounded-xl border border-nt-border bg-nt-surface-muted/50 p-3"
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                style={{ background: seg.color }}
              >
                M3
              </div>
              <div className="min-w-0 pt-0.5">
                <Link
                  href="/products"
                  className="text-sm font-semibold text-nt-blue hover:underline"
                >
                  {seg.name}
                </Link>
                <div className="mt-0.5 text-xs text-nt-text-muted">
                  {seg.purchased} license{seg.purchased === 1 ? "" : "s"} purchased
                </div>
              </div>
            </div>
          ))}
          {segments.length === 0 && (
            <p className="text-sm text-nt-text-muted">No licenses in this isolated tenant.</p>
          )}
        </div>
      </div>
    </div>
  );
}
