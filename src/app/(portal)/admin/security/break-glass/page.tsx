"use client";

import { FormEvent, useEffect, useState } from "react";
import { portalFetch, useSuperAdminHeaders } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

export default function Page() {
  const headers = useSuperAdminHeaders();
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const d = await portalFetch("/api/csp/break-glass").then((r) => r.json());
    setEmails(d.emails || []);
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
    setMessage("Break-glass account updated.");
    await load();
  }

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Break-glass accounts"
        subtitle="Emergency credential login when Entra is unavailable. Every use is audited."
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
      {message && <div className="mb-3 text-sm text-nt-text-muted">{message}</div>}
      <ul className="space-y-2">
        {emails.map((email) => (
          <li key={email} className="nt-card flex items-center justify-between p-3 text-sm">
            <span className="font-medium">{email}</span>
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
          </li>
        ))}
      </ul>
    </div>
  );
}
