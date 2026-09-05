"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Menu, Send, X, Minimize2, ChevronUp } from "lucide-react";
import { useChat } from "@/components/chat/ChatProvider";
import { useSession } from "@/components/auth/SessionProvider";
import type { SupportTeam } from "@/lib/tenancy-types";

export default function ChatWidget() {
  const { user, isClient } = useSession();
  const {
    open,
    openChat,
    closeChat,
    activeThread,
    threads,
    setActiveThreadId,
    unreadCount,
    startClientChat,
    sendClientMessage,
  } = useChat();

  const [draft, setDraft] = useState("");
  const [team, setTeam] = useState<SupportTeam>("technical");
  const [starting, setStarting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !isClient) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [open, isClient, activeThread?.messages.length]);

  if (!isClient || !user) return null;

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (!draft.trim()) return;
    const text = draft.trim();
    setDraft("");
    if (!activeThread) {
      setStarting(true);
      try {
        await startClientChat(team, text);
      } finally {
        setStarting(false);
      }
    } else {
      await sendClientMessage(text);
    }
  }

  const agentName = activeThread?.assignedAgentName;
  const showActiveBanner = !open && activeThread?.status === "active" && agentName;
  const showUnreadBanner = !open && !showActiveBanner && unreadCount > 0;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2.5">
      {open && (
        <div className="nt-fade-in flex w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-nt-border bg-white shadow-[var(--shadow-lg)]">
          <div className="flex items-center justify-between border-b border-nt-border bg-white px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-nt-text">
                {agentName ? `Chatting with ${agentName}` : "netrichtechnologies Support"}
              </div>
              <div className="text-[11px] text-nt-text-muted">
                {activeThread?.status === "queued"
                  ? "Waiting for an agent..."
                  : activeThread?.status === "active"
                    ? `${activeThread.team === "billing" ? "Billing" : "Technical"} Support · Online`
                    : "Start a conversation with Technical or Billing"}
              </div>
            </div>
            <button
              type="button"
              onClick={closeChat}
              className="rounded-lg p-1.5 text-nt-text-muted hover:bg-nt-surface-muted"
              aria-label="Minimize"
            >
              <Minimize2 size={15} />
            </button>
          </div>

          {threads.length > 1 && (
            <div className="flex gap-1 overflow-x-auto border-b border-nt-border px-2 py-2">
              {threads.slice(0, 5).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveThreadId(t.id)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    activeThread?.id === t.id
                      ? "bg-nt-purple text-white"
                      : "bg-nt-surface-muted text-nt-text-muted"
                  }`}
                >
                  {t.team === "billing" ? "Billing" : "Technical"}
                </button>
              ))}
            </div>
          )}

          <div
            ref={listRef}
            className="nt-scroll flex h-72 flex-col gap-2.5 overflow-y-auto bg-[#f7f7f7] p-3.5"
          >
            {!activeThread && (
              <div className="m-auto max-w-[260px] space-y-3 text-center text-sm text-nt-text-muted">
                <p>Message netrichtechnologies Technical or Billing support directly.</p>
                <div className="flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTeam("technical")}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      team === "technical"
                        ? "bg-nt-purple text-white"
                        : "bg-white ring-1 ring-nt-border"
                    }`}
                  >
                    Technical
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeam("billing")}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      team === "billing"
                        ? "bg-nt-purple text-white"
                        : "bg-white ring-1 ring-nt-border"
                    }`}
                  >
                    Billing
                  </button>
                </div>
              </div>
            )}

            {activeThread?.messages.map((m) => {
              if (m.sender === "system") {
                return (
                  <div
                    key={m.id}
                    className="mx-auto max-w-[92%] rounded-full bg-white px-3 py-1.5 text-center text-[11px] text-nt-text-muted"
                  >
                    {m.text}
                  </div>
                );
              }
              const mine = m.sender === "client";
              return (
                <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  <span className="mb-1 px-1 text-[10px] text-nt-text-subtle">
                    {m.senderName} · {format(new Date(m.createdAt), "h:mm a")}
                  </span>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                      mine
                        ? "rounded-br-md bg-[#f7d6d6] text-nt-text"
                        : "rounded-bl-md bg-white ring-1 ring-nt-border/70"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              );
            })}
          </div>

          <form
            onSubmit={handleSend}
            className="flex items-center gap-2 border-t border-nt-border p-3"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                activeThread ? "Type a message here" : "Say hello to start chatting..."
              }
              disabled={starting}
              className="nt-input min-w-0 flex-1"
            />
            <button
              type="submit"
              disabled={!draft.trim() || starting}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-nt-purple text-white disabled:opacity-40"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}

      {showActiveBanner && (
        <button
          type="button"
          onClick={openChat}
          className="inline-flex items-center gap-2 rounded-t-lg bg-[#c50f1f] px-4 py-2 text-xs font-semibold text-white"
        >
          Chatting with {agentName}
          <ChevronUp size={14} />
        </button>
      )}

      {showUnreadBanner && (
        <button
          type="button"
          onClick={openChat}
          className="inline-flex items-center gap-2 rounded-t-lg bg-[#c50f1f] px-4 py-2 text-xs font-semibold text-white"
        >
          You have got {unreadCount} new message{unreadCount === 1 ? "" : "s"}.
          <ChevronUp size={14} />
        </button>
      )}

      <button
        type="button"
        onClick={() => (open ? closeChat() : openChat())}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[#0078d4] text-white shadow-lg"
        aria-label="Open support chat"
      >
        {open ? <X size={20} /> : <Menu size={22} />}
        {unreadCount > 0 && !open && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#c50f1f] px-1 text-[10px] font-bold ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
