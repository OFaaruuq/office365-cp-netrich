"use client";

import { FormEvent, useEffect, useState } from "react";
import { portalFetch, useSuperAdminHeaders } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

type BreakGlassSession = {
  id: string;
  email: string;
  reason: string;
  actorEmail: string;
  startedAt: string;
  expiresAt: string;
  endedAt?: string;
};

export default function Page() {
  const headers = useSuperAdminHeaders();
  const [emails, setEmails] = useState<string[]>([]);
  const [sessions, setSessions] = useState<BreakGlassSession[]>([]);
  const [draft, setDraft] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const d = await portalFetch("/api/csp/break-glass").then((r) => r.json());
    setEmails(d.emails || []);
    setSessions(d.sessions || []);
  }
  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await portalFetch("/api/csp/break-glass", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: draft.trim().toLowerCase() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Failed");
      return;
    }
    setDraft("");
    setMessage(data.message || "Break-glass account updated.");
    await load();
  }

  async function activate(email: string) {
    const why = reason.trim();
    if (!why) {
      setMessage("Enter a reason before starting an emergency window.");
      return;
    }
    const res = await portalFetch("/api/csp/break-glass/activate", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, reason: why, durationMinutes: 30 }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Failed");
      return;
    }
    setReason("");
    setMessage(`Emergency window started for ${email}.`);
    await load();
  }

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Break-glass accounts"
        subtitle="Emergency credential login when Entra is unavailable. Each account needs a unique password. Starting a window is audited."
      />
      <form onSubmit={onSubmit} className="nt-card mb-4 flex flex-wrap gap-2 p-4">
        <input
          className="nt-input min-w-[240px] flex-1"
          type="email"
          placeholder="breakglass@netrichtechnologies.com"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          required
        />
        <button type="submit" className="nt-btn-primary text-xs">
          Add / allow
        </button>
      </form>
      <div className="nt-card mb-4 p-4">
        <label className="block text-xs font-medium text-nt-text-muted">
          Emergency window reason *
          <input
            className="nt-input mt-1"
            placeholder="Entra outage — restore partner access"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </div>
      {message && <div className="mb-3 text-sm text-nt-text-muted">{message}</div>}
      <ul className="space-y-2">
        {emails.map((email) => (
          <li key={email} className="nt-card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <span className="font-medium">{email}</span>
            <div className="flex gap-2">
              <button type="button" className="nt-btn-outline text-xs" onClick={() => void activate(email)}>
                Start 30m window
              </button>
              <button
                type="button"
                className="text-xs font-semibold text-nt-danger"
                onClick={() =>
                  void portalFetch("/api/csp/break-glass", {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ email, remove: true }),
                  }).then(load)
                }
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      {sessions.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Active emergency windows</h2>
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.id} className="nt-card p-3 text-sm">
                <div className="font-medium">{s.email}</div>
                <div className="text-xs text-nt-text-muted">
                  {s.reason} · until {new Date(s.expiresAt).toLocaleString()} · started by {s.actorEmail}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
