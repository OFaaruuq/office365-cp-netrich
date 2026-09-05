"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { RenewalItem } from "@/lib/types";

export default function RenewalCalendar({ renewals }: { renewals: RenewalItem[] }) {
  const [current, setCurrent] = useState(new Date(2026, 8, 1));
  const [localTz, setLocalTz] = useState(true);

  const renewalDates = useMemo(
    () => renewals.map((r) => parseISO(r.renewalDate)),
    [renewals]
  );

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(current));
    const end = endOfWeek(endOfMonth(current));
    return eachDayOfInterval({ start, end });
  }, [current]);

  return (
    <div className="nt-card nt-fade-in overflow-hidden">
      <div className="border-b border-nt-border px-6 pt-5 pb-4">
        <h2 className="nt-section-label mb-0">Renewal Calendar</h2>
      </div>

      <div className="flex flex-col gap-0 lg:flex-row">
        <div className="w-full border-b border-nt-border p-5 lg:max-w-[300px] lg:border-r lg:border-b-0">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrent((d) => addMonths(d, -1))}
              className="rounded-lg p-1.5 text-nt-text-muted transition hover:bg-nt-surface-muted hover:text-nt-text"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold tracking-tight">
              {format(current, "MMMM yyyy")}
            </span>
            <button
              type="button"
              onClick={() => setCurrent((d) => addMonths(d, 1))}
              className="rounded-lg p-1.5 text-nt-text-muted transition hover:bg-nt-surface-muted hover:text-nt-text"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold text-nt-text-subtle">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 text-center text-sm">
            {days.map((day) => {
              const hasRenewal = renewalDates.some((rd) => isSameDay(rd, day));
              const inMonth = isSameMonth(day, current);
              return (
                <div key={day.toISOString()} className="flex items-center justify-center py-1">
                  <span
                    className={[
                      "flex h-8 w-8 items-center justify-center rounded-full text-[13px] transition",
                      !inMonth && "text-nt-border-strong",
                      hasRenewal &&
                        inMonth &&
                        "bg-nt-purple font-semibold text-white shadow-sm",
                      !hasRenewal && inMonth && "text-nt-text hover:bg-nt-purple-soft",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {format(day, "d")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="hidden grid-cols-[140px_1fr] border-b border-nt-border bg-nt-surface-muted px-5 py-2.5 text-[11px] font-bold tracking-wide text-nt-text-subtle uppercase sm:grid">
            <div>Renewal Date</div>
            <div>Renewal Product</div>
          </div>
          <div>
            {renewals.map((r) => {
              const date = parseISO(r.renewalDate);
              return (
                <div
                  key={r.id}
                  className="grid gap-1 border-b border-nt-border px-5 py-4 last:border-0 sm:grid-cols-[140px_1fr] sm:gap-4"
                >
                  <div>
                    <div className="text-sm font-semibold text-nt-text">
                      {format(date, "MMM d EEE yyyy")}
                    </div>
                    <div className="mt-0.5 text-xs text-nt-text-muted">03:00</div>
                  </div>
                  <div>
                    <Link
                      href="/products"
                      className="text-sm font-semibold text-nt-blue hover:underline"
                    >
                      {r.productName}
                    </Link>
                    <div className="mt-1 text-xs text-nt-text-muted">
                      {r.commitment} | {r.billing} | {r.licenses} License
                      {r.licenses !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-nt-border bg-nt-surface-muted/40 px-5 py-3.5">
        <label className="flex items-center gap-2.5 text-sm text-nt-text-muted">
          <button
            type="button"
            role="switch"
            aria-checked={localTz}
            onClick={() => setLocalTz(!localTz)}
            className={[
              "relative h-6 w-11 rounded-full transition-colors",
              localTz ? "bg-nt-purple" : "bg-nt-border-strong",
            ].join(" ")}
          >
            <span
              className={[
                "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                localTz && "translate-x-5",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </button>
          Local Time Zone
        </label>
        <div className="flex gap-2">
          <button type="button" className="nt-btn-outline">
            View All
          </button>
          <Link href="/products" className="nt-btn-outline inline-flex items-center">
            My Products
          </Link>
        </div>
      </div>
    </div>
  );
}
