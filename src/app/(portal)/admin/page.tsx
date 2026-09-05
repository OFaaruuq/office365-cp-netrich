"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  Headphones,
  MessageSquare,
  Plus,
  Settings2,
  Shield,
} from "lucide-react";
import type { ClientTenant } from "@/lib/tenancy-types";
import { useChat } from "@/components/chat/ChatProvider";
import { useSession } from "@/components/auth/SessionProvider";
import { useSuperAdminHeaders, portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge, PortalAccessBadge } from "@/components/admin/StatusBadge";

export default function AdminHomePage() {
  const router = useRouter();
  const { user, isPartner, ready } = useSession();
  const headers = useSuperAdminHeaders();
  const { threads, unreadCount } = useChat();
  const [summary, setSummary] = useState({
    total: 0,
    active: 0,
    pending: 0,
    suspended: 0,
    rejected: 0,
  });
  const [customers, setCustomers] = useState<ClientTenant[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await portalFetch("/api/admin/customers");
    const data = await res.json();
    setSummary(data.summary || summary);
    setCustomers(data.customers || []);
  }

  useEffect(() => {
    if (ready && !isPartner) router.replace("/dashboard");
  }, [ready, isPartner, router]);

  useEffect(() => {
    if (isPartner) void load();
  }, [isPartner]);

  const queued = threads.filter((t) => t.status === "queued").length;
  const pending = customers.filter((c) => c.status === "pending");
  const recent = customers.slice(0, 6);

  async function quickApprove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await portalFetch("/api/admin/customers", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ id, action: "approve", force: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Approve failed");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (!ready || !isPartner) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-nt-text-muted">
        Checking Super Admin access…
      </div>
    );
  }

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Partner control center"
        subtitle={`Welcome, ${user?.name}. Create, configure, and approve every client Microsoft 365 tenant. Clients cannot self-provision.`}
        actions={
          <>
            <Link href="/admin/customers" className="nt-btn-on-brand inline-flex items-center gap-1.5">
              <Plus size={14} />
              Create client
            </Link>
            <Link href="/support" className="nt-btn-on-brand-ghost inline-flex items-center gap-1.5">
              <Headphones size={14} />
              Support inbox
            </Link>
          </>
        }
      />

      {error && (
        <div className="mb-4 rounded-xl border border-nt-danger/30 bg-nt-danger-soft px-4 py-3 text-sm text-nt-danger">
          {error}
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Client tenants"
          value={summary.total}
          icon={Building2}
          tone="purple"
          href="/admin/customers"
          hint="All provisioned organizations"
        />
        <StatCard
          label="Active"
          value={summary.active}
          icon={CheckCircle2}
          tone="success"
          hint="Portal access granted"
        />
        <StatCard
          label="Pending approval"
          value={summary.pending}
          icon={Clock3}
          tone="warning"
          href="/admin/customers"
          hint="Awaiting Super Admin"
        />
        <StatCard
          label="Support queue"
          value={queued}
          icon={MessageSquare}
          tone="blue"
          href="/support"
          hint={`${unreadCount} unread messages`}
        />
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {[
          {
            step: "1",
            title: "Create",
            text: "Provision the client tenant with domain and admin email.",
          },
          {
            step: "2",
            title: "Configure",
            text: "Set GDAP, sync, catalogs, and billing / technical contacts.",
          },
          {
            step: "3",
            title: "Approve",
            text: "Enable portal login so the client admin can sign in.",
          },
        ].map((s) => (
          <div key={s.step} className="nt-card flex gap-3 p-4">
            <div className="nt-admin-step-dot bg-nt-purple text-white">{s.step}</div>
            <div>
              <div className="text-sm font-semibold text-nt-text">{s.title}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-nt-text-muted">{s.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <div className="nt-card overflow-hidden xl:col-span-3">
          <div className="flex items-center justify-between border-b border-nt-border bg-nt-surface-muted/60 px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-nt-text">Awaiting approval</h2>
              <p className="text-xs text-nt-text-muted">Pending tenants need configure → approve</p>
            </div>
            <Link href="/admin/customers" className="nt-link inline-flex items-center gap-1 text-xs">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {pending.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Shield className="mx-auto mb-2 text-nt-purple" size={22} />
              <p className="text-sm font-medium text-nt-text">No pending tenants</p>
              <p className="mt-1 text-xs text-nt-text-muted">
                Create a client when you are ready to onboard a new organization.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-nt-border">
              {pending.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-nt-purple-soft/25"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{c.name}</div>
                    <div className="truncate text-xs text-nt-text-muted">
                      {c.domain} · {c.adminEmail}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={c.status} />
                    <Link
                      href={`/admin/customers/${c.id}`}
                      className="nt-btn-outline inline-flex items-center gap-1 py-1.5 text-xs"
                    >
                      <Settings2 size={12} />
                      Configure
                    </Link>
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => void quickApprove(c.id)}
                      className="nt-btn-primary py-1.5 text-xs"
                    >
                      {busyId === c.id ? "…" : "Approve"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="nt-card overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between border-b border-nt-border bg-nt-surface-muted/60 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-nt-text">Recent clients</h2>
            <Link href="/admin/customers" className="nt-link text-xs">
              Manage
            </Link>
          </div>
          <div className="divide-y divide-nt-border">
            {recent.map((c) => (
              <Link
                key={c.id}
                href={`/admin/customers/${c.id}`}
                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-nt-surface-muted"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{c.name}</div>
                  <div className="truncate text-xs text-nt-text-muted">{c.domain}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge status={c.status} />
                  <PortalAccessBadge enabled={!!c.config?.portalAccessEnabled} />
                </div>
              </Link>
            ))}
            {recent.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-nt-text-muted">
                No clients yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
