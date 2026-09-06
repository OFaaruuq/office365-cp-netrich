"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, ShieldCheck } from "lucide-react";
import { useSession, type MfaChallenge } from "@/components/auth/SessionProvider";
import { roleHomePath, type SessionUser } from "@/lib/tenancy-types";

function isSessionUser(v: SessionUser | MfaChallenge): v is SessionUser {
  return "accountId" in v && "role" in v;
}

const SLIDES = [
  {
    title: "Microsoft Teams: Become a Superhero and Fortify Your Modern Workplace",
    body: "Introduction to modern productivity tools, and how to integrate Artificial Intelligence into Teams in an organizationally responsible way.",
  },
  {
    title: "Microsoft 365 Copilot — Are You AI Ready?",
    body: "Microsoft 365 Copilot is the future of work: an AI-powered companion that streamlines tasks, boosts productivity, and unlocks new possibilities.",
  },
  {
    title: "Mastering Microsoft 365 Cloud Backup: Strategies and Best Practices",
    body: "Discover the benefits of an efficient cloud backup solution designed for Microsoft 365, protecting against accidental deletions, ransomware attacks, and data loss.",
  },
];

export default function SignInPage() {
  const router = useRouter();
  const { user, ready, signInWithCredentials, signInWithEntra, completeMfa, demoLogin, entraConfigured } =
    useSession();
  const [slide, setSlide] = useState(0);
  const [showCreds, setShowCreds] = useState(false);
  const [afterLoginPath, setAfterLoginPath] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfa, setMfa] = useState<MfaChallenge | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user) {
      router.replace(roleHomePath(user.role));
    }
  }, [ready, user, router]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSlide((s) => (s + 1) % SLIDES.length);
    }, 7000);
    return () => window.clearInterval(id);
  }, []);

  function openLogin(nextPath?: string) {
    setShowCreds(true);
    setAfterLoginPath(nextPath || null);
    setMfa(null);
    setMfaCode("");
    setError(null);
  }

  function finishLogin(session: SessionUser) {
    const destination = afterLoginPath || roleHomePath(session.role);
    router.push(destination);
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithCredentials(email.trim(), password);
      if (isSessionUser(result)) {
        finishLogin(result);
        return;
      }
      setMfa(result);
      setMfaCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(e: FormEvent) {
    e.preventDefault();
    if (!mfa) return;
    setLoading(true);
    setError(null);
    try {
      const session = await completeMfa(
        mfa.challengeId,
        mfaCode.trim(),
        mfa.step === "enroll" ? "enroll" : "verify"
      );
      finishLogin(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "MFA verification failed");
    } finally {
      setLoading(false);
    }
  }

  if (!ready || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm text-[#6b7280]">
        Loading…
      </div>
    );
  }

  const active = SLIDES[slide];

  return (
    <div className="flex min-h-screen flex-col bg-white lg:flex-row">
      {/* Left brand panel */}
      <aside className="relative flex min-h-[42vh] w-full flex-col overflow-hidden text-white lg:min-h-screen lg:w-[38%]">
        <Image
          src="/login-hero-workspace.png"
          alt=""
          fill
          priority
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 38vw"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(145deg, rgba(158,0,20,0.88) 0%, rgba(120,20,80,0.55) 42%, rgba(0,90,240,0.82) 100%)",
          }}
        />

        <div className="relative z-10 flex h-full flex-col px-8 py-8 sm:px-10 lg:px-12 lg:py-10">
          <div>
            <Link href="/" className="inline-block">
              <div className="text-[20px] font-bold tracking-[-0.03em] text-white sm:text-[22px]">
                netrichtechnologies
              </div>
              <div className="mt-1 text-[11px] font-medium tracking-[0.02em] text-white/75">
                Microsoft 365 Control Panel
              </div>
            </Link>

            <div className="mt-8 flex gap-2" aria-label="Feature slides">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Slide ${i + 1}`}
                  aria-current={i === slide}
                  onClick={() => setSlide(i)}
                  className={`h-[3px] w-8 rounded-full transition ${
                    i === slide ? "bg-white" : "bg-white/35 hover:bg-white/55"
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="mt-auto max-w-md pb-4 pt-16 lg:pb-8">
            <h2 className="text-2xl font-semibold leading-snug tracking-tight text-white/95 sm:text-[28px]">
              {active.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/80 sm:text-[15px]">
              {active.body}
            </p>
          </div>

          <button
            type="button"
            onClick={() => openLogin("/catalog/microsoft-365")}
            className="relative z-10 mt-6 inline-flex items-center gap-2.5 self-start pb-2 text-sm font-medium text-white/90 transition hover:text-white lg:mt-auto"
          >
            <Menu size={18} strokeWidth={2} />
            View Full Webinar List
          </button>
        </div>
      </aside>

      {/* Right login panel */}
      <main className="relative flex w-full flex-1 flex-col lg:w-[62%]">
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 sm:px-10 lg:px-16">
          <div className="w-full max-w-[520px] text-center">
            <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#2d2d2d] sm:text-[34px] lg:text-[38px]">
              Maximize Your Microsoft 365 with netrichtechnologies
            </h1>

            {!showCreds && (
              <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      setError(null);
                      const result = await signInWithEntra();
                      if (result.mode === "unavailable") {
                        if (demoLogin) openLogin();
                        else setError(result.message || "Entra SSO not configured");
                      }
                    })();
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-md bg-[#0078d4] px-6 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[#106ebe]"
                >
                  Sign in with Microsoft
                </button>
                {demoLogin && (
                  <button
                    type="button"
                    onClick={() => openLogin()}
                    className="inline-flex h-11 items-center justify-center rounded-md border border-[#0078d4] bg-white px-6 text-[15px] font-semibold text-[#0078d4] transition hover:bg-[#f3f9fd]"
                  >
                    Demo email sign-in
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openLogin("/catalog/microsoft-365")}
                  disabled={!demoLogin && !entraConfigured}
                  className="inline-flex h-11 items-center justify-center rounded-md border border-[#0078d4] bg-white px-6 text-[15px] font-semibold text-[#0078d4] transition hover:bg-[#f3f9fd] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Explore Plans
                </button>
              </div>
            )}

            {!demoLogin && !entraConfigured && !showCreds && (
              <p className="mt-4 text-sm text-[#c47a00]">
                Configure NEXT_PUBLIC_AZURE_AD_CLIENT_ID for Entra SSO, or set ALLOW_DEMO_LOGIN=true for
                local demo.
              </p>
            )}
            {entraConfigured && !showCreds && (
              <p className="mt-4 text-[12px] text-[#8a8a8a]">
                Production identity: Microsoft Entra ID (MFA via Conditional Access). Demo email/TOTP is
                for local development only.
              </p>
            )}

            <p className="mt-5 text-[13px] text-[#8a8a8a]">
              Access requires a Microsoft 365 administrator account.
            </p>

            {showCreds && !mfa && (
              <form
                onSubmit={handlePasswordSubmit}
                className="nt-fade-in mt-8 rounded-md border border-[#e5e5e5] bg-white p-6 text-left shadow-sm"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#2d2d2d]">Sign in</h2>
                    {afterLoginPath?.startsWith("/catalog") && (
                      <p className="mt-1 text-xs text-[#8a8a8a]">
                        Sign in to explore plans available for your account.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreds(false);
                      setAfterLoginPath(null);
                    }}
                    className="text-xs font-semibold text-[#0078d4] hover:underline"
                  >
                    Back
                  </button>
                </div>

                {error && (
                  <div className="mb-4 rounded-md border border-[#f1c0c0] bg-[#fdecec] px-3 py-2 text-sm text-[#c42b2b]">
                    {error}
                  </div>
                )}

                <label className="block text-xs font-semibold text-[#605e5c]">
                  Work email
                  <input
                    className="mt-1.5 w-full rounded-md border border-[#8a8886] px-3 py-2.5 text-sm text-[#323130] outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@company.com"
                    disabled={loading}
                  />
                </label>
                <label className="mt-3 block text-xs font-semibold text-[#605e5c]">
                  Password
                  <input
                    className="mt-1.5 w-full rounded-md border border-[#8a8886] px-3 py-2.5 text-sm text-[#323130] outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={loading}
                  />
                </label>

                <button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="mt-5 flex h-11 w-full items-center justify-center rounded-md bg-[#0078d4] text-[15px] font-semibold text-white transition hover:bg-[#106ebe] disabled:opacity-60"
                >
                  {loading ? "Signing in…" : "Continue"}
                </button>
                <p className="mt-3 text-center text-[12px] text-[#8a8a8a]">
                  Multi-factor authentication (Google Authenticator) is required for all users.
                </p>
              </form>
            )}

            {showCreds && mfa && (
              <form
                onSubmit={handleMfaSubmit}
                className="nt-fade-in mt-8 rounded-md border border-[#e5e5e5] bg-white p-6 text-left shadow-sm"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 text-[#0078d4]" size={18} />
                    <div>
                      <h2 className="text-base font-semibold text-[#2d2d2d]">
                        {mfa.step === "enroll" ? "Set up authenticator" : "Authenticator code"}
                      </h2>
                      <p className="mt-1 text-xs text-[#8a8a8a]">
                        {mfa.message ||
                          "Enter the 6-digit code from Google Authenticator."}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMfa(null);
                      setMfaCode("");
                      setError(null);
                    }}
                    className="text-xs font-semibold text-[#0078d4] hover:underline"
                  >
                    Back
                  </button>
                </div>

                {error && (
                  <div className="mb-4 rounded-md border border-[#f1c0c0] bg-[#fdecec] px-3 py-2 text-sm text-[#c42b2b]">
                    {error}
                  </div>
                )}

                {mfa.step === "enroll" && mfa.qrDataUrl && (
                  <div className="mb-4 flex flex-col items-center gap-3 rounded-md border border-[#eee] bg-[#fafafa] p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mfa.qrDataUrl}
                      alt="Google Authenticator QR code"
                      className="h-[180px] w-[180px] rounded-md bg-white"
                    />
                    <p className="text-center text-[11px] text-[#8a8a8a]">
                      Scan with Google Authenticator, Microsoft Authenticator, or any TOTP app.
                    </p>
                    {mfa.secret && (
                      <p className="break-all text-center font-mono text-[11px] text-[#605e5c]">
                        Manual key: {mfa.secret}
                      </p>
                    )}
                  </div>
                )}

                <label className="block text-xs font-semibold text-[#605e5c]">
                  6-digit code
                  <input
                    className="mt-1.5 w-full rounded-md border border-[#8a8886] px-3 py-2.5 text-center font-mono text-lg tracking-[0.35em] text-[#323130] outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    disabled={loading}
                  />
                </label>

                <button
                  type="submit"
                  disabled={loading || mfaCode.length !== 6}
                  className="mt-5 flex h-11 w-full items-center justify-center rounded-md bg-[#0078d4] text-[15px] font-semibold text-white transition hover:bg-[#106ebe] disabled:opacity-60"
                >
                  {loading
                    ? "Verifying…"
                    : mfa.step === "enroll"
                      ? "Enable MFA & sign in"
                      : "Verify & sign in"}
                </button>
              </form>
            )}
          </div>
        </div>

        <footer className="flex flex-col gap-2 border-t border-[#eee] px-6 py-4 text-[12px] text-[#8a8a8a] sm:flex-row sm:items-center sm:justify-between sm:px-10 lg:px-12">
          <span>© {new Date().getFullYear()} netrichtechnologies</span>
          <nav className="flex flex-wrap gap-x-3 gap-y-1">
            <a href="#" className="text-[#0078d4] hover:underline">
              Website Terms
            </a>
            <span aria-hidden>|</span>
            <a href="#" className="text-[#0078d4] hover:underline">
              Privacy Statement
            </a>
            <span aria-hidden>|</span>
            <a href="#" className="text-[#0078d4] hover:underline">
              Microsoft 365 Terms
            </a>
          </nav>
        </footer>
      </main>
    </div>
  );
}
