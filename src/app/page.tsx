"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import BrandLogo from "@/components/layout/BrandLogo";
import { useSession } from "@/components/auth/SessionProvider";
import { roleHomePath, roleLabel } from "@/lib/tenancy-types";
import clsx from "clsx";

export default function SignInPage() {
  const router = useRouter();
  const { accounts, signIn } = useSession();
  const [selected, setSelected] = useState(accounts[5]?.id || accounts[0]?.id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const session = await signIn(selected);
      router.push(roleHomePath(session.role));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  const groups = [
    {
      title: "Client tenant (approved clients only — no self-signup)",
      roles: ["customer_admin"] as const,
    },
    {
      title: "netrichtechnologies Super Admin (manages all clients)",
      roles: ["partner_admin"] as const,
    },
    {
      title: "Netrich Technical Support",
      roles: ["support_technical"] as const,
    },
    {
      title: "Netrich Billing Support",
      roles: ["support_billing"] as const,
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 15% 10%, #7a45b5 0%, transparent 42%), radial-gradient(ellipse at 85% 90%, #243a5e 0%, transparent 40%), linear-gradient(155deg, #1a1028 0%, #2a1840 48%, #0e1729 100%)",
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 md:px-10">
        <BrandLogo href="/" light size="lg" />
      </header>

      <main className="relative z-10 mx-auto flex max-w-5xl flex-col px-6 pb-16">
        <div className="nt-fade-in mx-auto w-full max-w-3xl rounded-2xl border border-white/15 bg-white/95 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-nt-text sm:text-3xl">
            Sign in to Microsoft 365 Control Panel
          </h1>
          <p className="mt-2 text-sm text-nt-text-muted">
            Multi-tenant control panel. Only{" "}
            <strong>netrichtechnologies Super Admin</strong> can create, approve, and configure
            client tenants — clients cannot self-register.
          </p>

          {error && (
            <div className="mt-4 rounded-xl border border-nt-danger/30 bg-nt-danger-soft px-4 py-3 text-sm text-nt-danger">
              {error}
            </div>
          )}

          <div className="mt-6 space-y-5">
            {groups.map((g) => {
              const items = accounts.filter((a) =>
                (g.roles as readonly string[]).includes(a.role)
              );
              if (!items.length) return null;
              return (
                <div key={g.title}>
                  <div className="mb-2 text-[11px] font-bold tracking-wide text-nt-text-subtle uppercase">
                    {g.title}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {items.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setSelected(a.id)}
                        className={clsx(
                          "rounded-xl border px-4 py-3 text-left transition",
                          selected === a.id
                            ? "border-nt-purple bg-nt-purple-soft ring-2 ring-nt-purple/30"
                            : "border-nt-border bg-white hover:border-nt-purple/40"
                        )}
                      >
                        <div className="text-sm font-semibold text-nt-text">{a.name}</div>
                        <div className="text-xs text-nt-text-muted">{a.email}</div>
                        <div className="mt-1 text-[11px] font-medium text-nt-purple">
                          {roleLabel(a.role)}
                          {a.team ? ` · ${a.team}` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleSignIn}
            disabled={loading || !selected}
            className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-[#1f1f1f] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-70"
          >
            {loading ? "Signing in..." : "Continue"}
          </button>

          <p className="mt-4 text-center text-xs text-nt-text-muted">
            Domain:{" "}
            <span className="font-semibold text-nt-text">
              office365.cp.netrichtechnologies.com
            </span>
          </p>
        </div>
      </main>
    </div>
  );
}
