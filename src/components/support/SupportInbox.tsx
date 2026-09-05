"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Send, UserCheck, CheckCircle2 } from "lucide-react";
import { useChat } from "@/components/chat/ChatProvider";
import { useSession } from "@/components/auth/SessionProvider";
import clsx from "clsx";

export default function SupportInbox() {
  const { user, isSupport, isPartner } = useSession();
  const {
    threads,
    activeThread,
    setActiveThreadId,
    claimThread,
    sendAgentMessage,
    resolveThread,
    refresh,
    loading,
  } = useChat();

  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [activeThread?.messages.length]);

  if (!user || (!isSupport && !isPartner)) {
    return (
      <div className="nt-card p-8 text-center text-nt-text-muted">
        Support inbox is available for netrichtechnologies Technical and Billing teams.
      </div>
    );
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !activeThread) return;
    const text = draft.trim();
    setDraft("");
    await sendAgentMessage(activeThread.id, text);
  }

  return (
    <div className="nt-fade-in">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="nt-page-title mb-1">Support Inbox</h1>
          <p className="text-sm text-nt-text-muted">
            {user.team === "billing"
              ? "Billing Support"
              : user.team === "technical"
                ? "Technical Support"
                : "All teams"}{" "}
            · Chat live with client tenants
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} className="nt-btn-outline">
          Refresh
        </button>
      </div>

      <div className="grid min-h-[560px] grid-cols-1 overflow-hidden rounded-xl border border-nt-border bg-white shadow-xs lg:grid-cols-[320px_1fr]">
        <aside className="border-b border-nt-border lg:border-r lg:border-b-0">
          <div className="border-b border-nt-border bg-nt-surface-muted px-4 py-3 text-xs font-bold tracking-wide text-nt-text-subtle uppercase">
            Conversations {loading ? "…" : `(${threads.length})`}
          </div>
          <div className="nt-scroll max-h-[280px] overflow-y-auto lg:max-h-[520px]">
            {threads.length === 0 && (
              <div className="p-6 text-center text-sm text-nt-text-muted">No threads yet.</div>
            )}
            {threads.map((t) => {
              const unread = t.messages.filter((m) => m.sender === "client" && !m.readByAgent)
                .length;
              const last = t.messages[t.messages.length - 1];
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveThreadId(t.id)}
                  className={clsx(
                    "w-full border-b border-nt-border px-4 py-3 text-left transition hover:bg-nt-purple-soft/40",
                    activeThread?.id === t.id && "bg-nt-purple-soft"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{t.customerName}</span>
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                        t.status === "queued" && "bg-nt-warning-soft text-nt-warning",
                        t.status === "active" && "bg-nt-success-soft text-nt-success",
                        t.status === "resolved" && "bg-nt-surface-muted text-nt-text-muted"
                      )}
                    >
                      {t.status}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-nt-text-muted">
                    {t.clientUserName} · {t.team}
                  </div>
                  <div className="mt-1 truncate text-xs text-nt-text-subtle">{last?.text}</div>
                  {unread > 0 && (
                    <div className="mt-1 text-[11px] font-semibold text-nt-danger">
                      {unread} unread
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="flex min-h-[400px] flex-col">
          {!activeThread ? (
            <div className="m-auto p-8 text-center text-nt-text-muted">
              Select a client conversation to reply.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-nt-border px-4 py-3">
                <div>
                  <div className="font-semibold">{activeThread.customerName}</div>
                  <div className="text-xs text-nt-text-muted">
                    {activeThread.clientUserEmail} · {activeThread.subject}
                    {activeThread.assignedAgentName
                      ? ` · Agent: ${activeThread.assignedAgentName}`
                      : " · Unassigned"}
                  </div>
                </div>
                <div className="flex gap-2">
                  {activeThread.status === "queued" && isSupport && (
                    <button
                      type="button"
                      onClick={() => void claimThread(activeThread.id)}
                      className="nt-btn-primary inline-flex items-center gap-1.5"
                    >
                      <UserCheck size={14} />
                      Claim & introduce
                    </button>
                  )}
                  {activeThread.status !== "resolved" && (
                    <button
                      type="button"
                      onClick={() => void resolveThread(activeThread.id)}
                      className="nt-btn-outline inline-flex items-center gap-1.5"
                    >
                      <CheckCircle2 size={14} />
                      Resolve
                    </button>
                  )}
                </div>
              </div>

              <div ref={listRef} className="nt-scroll flex-1 space-y-3 overflow-y-auto bg-[#f7f7f7] p-4">
                {activeThread.messages.map((m) => {
                  if (m.sender === "system") {
                    return (
                      <div
                        key={m.id}
                        className="mx-auto max-w-md rounded-full bg-white px-3 py-1.5 text-center text-[11px] text-nt-text-muted"
                      >
                        {m.text}
                      </div>
                    );
                  }
                  const mine = m.sender === "agent";
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
                    >
                      <span className="mb-1 text-[10px] text-nt-text-subtle">
                        {m.senderName} · {format(new Date(m.createdAt), "MMM d, h:mm a")}
                      </span>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                          mine
                            ? "rounded-br-md bg-nt-purple text-white"
                            : "rounded-bl-md bg-white ring-1 ring-nt-border"
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
                className="flex gap-2 border-t border-nt-border bg-white p-3"
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    activeThread.status === "queued"
                      ? "Claim the chat first to introduce yourself…"
                      : "Type your reply to the client…"
                  }
                  disabled={activeThread.status === "queued"}
                  className="nt-input flex-1"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || activeThread.status === "queued"}
                  className="nt-btn-primary inline-flex items-center gap-1.5"
                >
                  <Send size={14} />
                  Send
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
