"use client";

import Link from "next/link";
import { Power, GraduationCap, CircleHelp, ExternalLink } from "lucide-react";
import { useChat } from "@/components/chat/ChatProvider";

export default function HelpResources() {
  const { openChat, startClientChat } = useChat();

  return (
    <div className="flex flex-col gap-3">
      <div className="nt-card nt-card-interactive flex gap-3.5 p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-nt-purple text-white shadow-sm">
          <Power size={20} />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-[0.06em] text-nt-text">
            GETTING STARTED
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-nt-text-muted">
            Get to know your Microsoft O365 workspace.
          </p>
          <Link href="/catalog/microsoft-365" className="nt-link mt-2 inline-block">
            O365 Configuration Guides
          </Link>
        </div>
      </div>

      <div className="nt-card nt-card-interactive flex gap-3.5 p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-nt-purple text-white shadow-sm">
          <GraduationCap size={20} />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-[0.06em] text-nt-text">
            TRAININGS & HOW TO ARTICLES
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-nt-text-muted">
            Learn about Microsoft O365 Products.
          </p>
          <Link href="/catalog/microsoft-365" className="nt-link mt-2 inline-block">
            O365 Products
          </Link>
        </div>
      </div>

      <div className="nt-card nt-card-interactive flex gap-3.5 p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-nt-purple text-white shadow-sm">
          <CircleHelp size={20} />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-[0.06em] text-nt-text">SUPPORT</div>
          <p className="mt-1 text-[13px] leading-relaxed text-nt-text-muted">
            Chat live with netrichtechnologies Technical or Billing.
          </p>
          <button
            type="button"
            onClick={() => {
              openChat();
              void startClientChat("technical", "Hi, I need assistance with my Microsoft 365 tenant.");
            }}
            className="nt-link mt-2 inline-flex items-center gap-1.5"
          >
            O365 Get Help
            <ExternalLink size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
