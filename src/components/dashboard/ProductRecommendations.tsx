import Link from "next/link";
import { Info } from "lucide-react";
import type { ProductRecommendation } from "@/lib/types";

const ICON_COLORS = ["#20a8b0", "#5b9bd5", "#2f6fed", "#7a45b5"];

export default function ProductRecommendations({
  items,
}: {
  items: ProductRecommendation[];
}) {
  return (
    <div className="nt-card flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-nt-border px-5 py-3.5">
        <h2 className="nt-section-label mb-0">Product Recommendations</h2>
        <Info size={14} className="text-nt-text-subtle" />
      </div>

      <div className="flex-1">
        {items.map((item, i) => (
          <div
            key={item.id}
            className="flex items-start gap-3 border-b border-nt-border px-5 py-3.5 last:border-0"
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm"
              style={{ background: ICON_COLORS[i % ICON_COLORS.length] }}
            >
              {item.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-nt-text">{item.name}</div>
              <Link
                href="/catalog/microsoft-365"
                className="nt-link mt-1 inline-block text-xs font-semibold"
              >
                Add Subscriptions
              </Link>
              <div className="mt-1 text-xs text-nt-text-muted">{item.status}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-nt-border p-3">
        <Link
          href="/catalog/microsoft-365"
          className="nt-btn-outline flex w-full items-center justify-center"
        >
          View All
        </Link>
      </div>
    </div>
  );
}
