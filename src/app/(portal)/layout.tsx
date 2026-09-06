"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import ChatWidget from "@/components/layout/ChatWidget";
import PortalFooter from "@/components/layout/PortalFooter";
import { ChatProvider } from "@/components/chat/ChatProvider";
import { NavProvider } from "@/components/layout/NavProvider";
import { useSession } from "@/components/auth/SessionProvider";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, ready, refreshSession } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/");
  }, [ready, user, router]);

  // Extra suspend check when entering any portal route
  useEffect(() => {
    if (!ready || !user) return;
    void refreshSession();
  }, [ready, user?.accountId, refreshSession]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-nt-bg text-sm text-nt-text-muted">
        Loading portal…
      </div>
    );
  }

  return (
    <ChatProvider>
      <NavProvider>
        <div className="nt-portal-canvas flex min-h-screen flex-col">
          <Header />
          <Sidebar />
          <main className="nt-main ml-0 flex flex-1 flex-col pt-[60px] lg:ml-[228px]">
            <div className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 sm:px-6 sm:py-6 md:px-7 md:py-7">
              {children}
            </div>
            <div className="pb-20 lg:pb-4">
              <PortalFooter />
            </div>
          </main>
          <ChatWidget />
        </div>
      </NavProvider>
    </ChatProvider>
  );
}
