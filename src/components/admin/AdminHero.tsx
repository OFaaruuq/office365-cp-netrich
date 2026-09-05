import type { ReactNode } from "react";
import { Shield } from "lucide-react";

type Props = {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  badge?: string;
};

export function AdminHero({ title, subtitle, actions, badge = "Super Admin" }: Props) {
  return (
    <div className="nt-admin-hero mb-6 overflow-hidden">
      <div className="relative px-5 py-5 sm:px-6 sm:py-6">
        <div className="pointer-events-none absolute inset-0 opacity-[0.12]">
          <div className="absolute -top-16 -right-10 h-48 w-48 rounded-full bg-white blur-2xl" />
          <div className="absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-nt-purple-light blur-3xl" />
        </div>
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold tracking-wide text-white uppercase ring-1 ring-white/25">
              <Shield size={12} />
              {badge}
            </div>
            <h1 className="text-[1.65rem] font-semibold tracking-tight text-white sm:text-[1.85rem]">
              {title}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-white/80">{subtitle}</p>
          </div>
          {actions && <div className="relative flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
