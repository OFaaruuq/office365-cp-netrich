"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, ExternalLink, Headset, Menu, User, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useChat } from "@/components/chat/ChatProvider";
import BrandLogo from "@/components/layout/BrandLogo";
import { useNav } from "@/components/layout/NavProvider";
import { useSession } from "@/components/auth/SessionProvider";

export default function Header() {
  const router = useRouter();
  const [supportOpen, setSupportOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const supportRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const { openChat, unreadCount, startClientChat } = useChat();
  const { mobileOpen, toggleMobile } = useNav();
  const { user, signOut, isClient, isSupport, isPartner, homePath } = useSession();

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (supportRef.current && !supportRef.current.contains(t)) setSupportOpen(false);
      if (profileRef.current && !profileRef.current.contains(t)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function handleLiveChat() {
    setSupportOpen(false);
    if (isClient) {
      openChat();
    } else if (isSupport || isPartner) {
      router.push("/support");
    }
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 shadow-[0_1px_0_rgba(0,0,0,0.04)] backdrop-blur-md">
      <div className="h-[3px] bg-gradient-to-r from-nt-purple via-[#c23a6b] to-[#e03c31]" />
      <div className="flex h-[57px] items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={toggleMobile}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-nt-text-muted transition hover:bg-nt-surface-muted hover:text-nt-text lg:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <BrandLogo href={homePath} />
        </div>

        <div className="flex items-center gap-0.5 text-sm sm:gap-1">
          <button
            type="button"
            className="relative flex items-center gap-2 rounded-lg px-2.5 py-2 text-nt-text-muted transition hover:bg-nt-surface-muted hover:text-nt-text sm:px-3"
          >
            <Bell size={16} strokeWidth={1.75} />
            <span className="hidden md:inline">Notifications</span>
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-nt-danger ring-2 ring-white" />
            )}
          </button>

          <div className="relative" ref={supportRef}>
            <button
              type="button"
              onClick={() => {
                setSupportOpen(!supportOpen);
                setProfileOpen(false);
              }}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 transition sm:px-3 ${
                supportOpen
                  ? "bg-nt-purple-soft text-nt-purple"
                  : "text-nt-text-muted hover:bg-nt-surface-muted hover:text-nt-text"
              }`}
            >
              <Headset size={16} strokeWidth={1.75} className="hidden sm:block" />
              <span className="hidden sm:inline">Support</span>
              <ChevronDown
                size={14}
                className={`transition-transform ${supportOpen ? "rotate-180" : ""}`}
              />
            </button>
            {supportOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-nt-border bg-white py-2 shadow-[var(--shadow-lg)]">
                <div className="border-b border-nt-border bg-nt-surface-muted px-4 py-3 text-xs text-nt-text-muted">
                  <div className="font-semibold text-nt-text">Contact Support</div>
                  <div className="mt-1.5 space-y-1">
                    <div>
                      US:{" "}
                      <a href="tel:+18005550199" className="nt-link text-xs">
                        +1 (800) 555-0199
                      </a>
                    </div>
                    <div>
                      INTL:{" "}
                      <a href="tel:+442079460958" className="nt-link text-xs">
                        +44 (0) 20 7946 0958
                      </a>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLiveChat}
                  className="flex w-full items-center px-4 py-2.5 text-left text-sm font-medium transition hover:bg-nt-purple-soft"
                >
                  Live Chat
                  {unreadCount > 0 && (
                    <span className="ml-2 rounded-full bg-nt-danger px-2 py-0.5 text-[10px] font-bold text-white">
                      {unreadCount}
                    </span>
                  )}
                </button>
                {isClient && (
                  <button
                    type="button"
                    onClick={() => {
                      setSupportOpen(false);
                      void startClientChat("billing", "Hi, I need billing help.");
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm transition hover:bg-nt-surface-muted"
                  >
                    Chat with Billing
                  </button>
                )}
                <a
                  href="https://learn.microsoft.com/microsoft-365"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between px-4 py-2.5 text-sm transition hover:bg-nt-surface-muted"
                >
                  How-to Articles
                  <ExternalLink size={12} className="text-nt-text-subtle" />
                </a>
              </div>
            )}
          </div>

          <div className="relative ml-0.5" ref={profileRef}>
            <button
              type="button"
              onClick={() => {
                setProfileOpen(!profileOpen);
                setSupportOpen(false);
              }}
              className="flex max-w-[260px] items-center gap-2 rounded-lg px-2 py-1.5 text-nt-text-muted transition hover:bg-nt-surface-muted"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-nt-purple-soft text-nt-purple">
                <User size={14} />
              </span>
              <span className="hidden truncate text-[13px] text-nt-text xl:inline">
                {user?.email || "Account"}
              </span>
              <ChevronDown size={14} className="hidden sm:block" />
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-nt-border bg-white py-1 shadow-[var(--shadow-lg)]">
                <div className="border-b border-nt-border px-4 py-3">
                  <div className="text-xs font-medium text-nt-text-subtle">
                    {user?.title || "Signed in"}
                  </div>
                  <div className="mt-0.5 truncate text-sm font-semibold text-nt-text">
                    {user?.email}
                  </div>
                  {user?.customerName && (
                    <div className="mt-1 text-xs text-nt-purple">{user.customerName}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    signOut();
                    window.location.href = "/";
                    router.push("/");
                  }}
                  className="block w-full px-4 py-2.5 text-left text-sm transition hover:bg-nt-danger-soft hover:text-nt-danger"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
