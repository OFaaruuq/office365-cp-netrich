"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { portalFetch } from "@/lib/admin-api";
import type { SupportTeam, SupportThread, ThreadMessage } from "@/lib/tenancy-types";

interface ChatContextValue {
  open: boolean;
  openChat: () => void;
  closeChat: () => void;
  threads: SupportThread[];
  activeThread: SupportThread | null;
  setActiveThreadId: (id: string | null) => void;
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  startClientChat: (team: SupportTeam, firstMessage: string) => Promise<void>;
  sendClientMessage: (text: string) => Promise<void>;
  sendAgentMessage: (threadId: string, text: string) => Promise<void>;
  claimThread: (threadId: string) => Promise<void>;
  resolveThread: (threadId: string) => Promise<void>;
  markRead: (threadId: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user, isClient, isSupport, isPartner } = useSession();
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setThreads([]);
      return;
    }
    setLoading(true);
    try {
      // Server forces tenant/team scope from signed session — do not pass customerId
      const res = await portalFetch("/api/support/threads");
      const data = await res.json();
      setThreads(data.threads || []);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) || threads[0] || null,
    [threads, activeThreadId]
  );

  const unreadCount = useMemo(() => {
    if (!user) return 0;
    if (isClient) {
      return threads.reduce(
        (sum, t) =>
          sum +
          t.messages.filter((m: ThreadMessage) => m.sender !== "client" && !m.readByClient)
            .length,
        0
      );
    }
    if (isSupport || isPartner) {
      return threads.reduce(
        (sum, t) =>
          sum +
          t.messages.filter((m: ThreadMessage) => m.sender === "client" && !m.readByAgent)
            .length,
        0
      );
    }
    return 0;
  }, [threads, user, isClient, isSupport, isPartner]);

  const openChat = useCallback(() => setOpen(true), []);
  const closeChat = useCallback(() => setOpen(false), []);

  const startClientChat = useCallback(
    async (team: SupportTeam, firstMessage: string) => {
      if (!user?.customerId) return;
      const res = await portalFetch("/api/support/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", team, firstMessage }),
      });
      const data = await res.json();
      await refresh();
      if (data.thread?.id) {
        setActiveThreadId(data.thread.id);
        setOpen(true);
      }
    },
    [user, refresh]
  );

  const sendClientMessage = useCallback(
    async (text: string) => {
      if (!user || !activeThread) return;
      await portalFetch("/api/support/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "message",
          threadId: activeThread.id,
          text,
        }),
      });
      await refresh();
    },
    [user, activeThread, refresh]
  );

  const sendAgentMessage = useCallback(
    async (threadId: string, text: string) => {
      if (!user) return;
      await portalFetch("/api/support/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "message", threadId, text }),
      });
      await refresh();
    },
    [user, refresh]
  );

  const claimThread = useCallback(
    async (threadId: string) => {
      if (!user || (!user.team && !isPartner)) return;
      await portalFetch("/api/support/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim", threadId }),
      });
      await refresh();
      setActiveThreadId(threadId);
      setOpen(true);
    },
    [user, isPartner, refresh]
  );

  const resolveThreadFn = useCallback(
    async (threadId: string) => {
      await portalFetch("/api/support/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", threadId }),
      });
      await refresh();
    },
    [refresh]
  );

  const markRead = useCallback(
    async (threadId: string) => {
      if (!user) return;
      await portalFetch("/api/support/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read", threadId }),
      });
      await refresh();
    },
    [user, refresh]
  );

  useEffect(() => {
    if (open && activeThread) {
      void markRead(activeThread.id);
    }
  }, [open, activeThread?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: ChatContextValue = {
    open,
    openChat,
    closeChat,
    threads,
    activeThread,
    setActiveThreadId,
    unreadCount,
    loading,
    refresh,
    startClientChat,
    sendClientMessage,
    sendAgentMessage,
    claimThread,
    resolveThread: resolveThreadFn,
    markRead,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
