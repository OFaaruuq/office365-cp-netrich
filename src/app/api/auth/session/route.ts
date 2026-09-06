import { NextRequest, NextResponse } from "next/server";
import { getAccount, getCustomer } from "@/lib/tenancy-data";
import { findCustomer } from "@/lib/customer-store";
import {
  applySessionCookie,
  clearSessionCookie,
  readSessionFromRequest,
  toClientSession,
} from "@/lib/auth/server-session";
import { assertClientPortalActive } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit-log";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isDemoLoginAllowed } from "@/lib/auth/demo-mode";

export async function GET(request: NextRequest) {
  const session = await readSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({
      authenticated: false,
      user: null,
      demoLogin: isDemoLoginAllowed(),
    });
  }
  const locked = assertClientPortalActive(session);
  if (locked) {
    return locked;
  }
  return NextResponse.json({
    authenticated: true,
    user: toClientSession(session),
    demoLogin: isDemoLoginAllowed(),
  });
}

export async function POST(request: NextRequest) {
  if (!isDemoLoginAllowed()) {
    return NextResponse.json(
      {
        error:
          "Passwordless demo login is disabled. Configure Microsoft Entra ID (MSAL) or set ALLOW_DEMO_LOGIN=true for staging demos.",
        code: "DEMO_LOGIN_DISABLED",
      },
      { status: 403 }
    );
  }

  const ip = clientIp(request);
  const limited = rateLimit(`login:${ip}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      {
        error: "Too many sign-in attempts. Try again shortly.",
        code: "RATE_LIMITED",
        retryAfterSec: limited.retryAfterSec,
      },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const accountId = String(body.accountId || "");
  const account = getAccount(accountId);
  if (!account) {
    writeAudit({
      action: "auth.login_denied",
      actorAccountId: accountId || "unknown",
      actorEmail: "unknown",
      actorRole: "unknown",
      detail: "Unknown account",
      meta: { ip },
    });
    return NextResponse.json({ error: "Unknown account" }, { status: 404 });
  }

  let customerName: string | undefined;
  if (account.role === "customer_admin") {
    if (!account.customerId) {
      return NextResponse.json(
        { error: "Client account is not bound to a tenant." },
        { status: 403 }
      );
    }
    const live = findCustomer(account.customerId) || getCustomer(account.customerId);
    if (!live) {
      return NextResponse.json({ error: "Client tenant not found" }, { status: 404 });
    }
    if (live.status !== "active" || !live.config?.portalAccessEnabled) {
      const reason =
        live.status === "pending"
          ? "This client tenant is pending approval by netrichtechnologies Super Admin."
          : live.status === "suspended"
            ? "This client tenant is suspended. Contact netrichtechnologies."
            : live.status === "rejected"
              ? "This client tenant was rejected. Contact netrichtechnologies."
              : "Portal access is locked. Only Netrich Super Admin can enable it.";
      writeAudit({
        action: "auth.login_denied",
        actorAccountId: account.id,
        actorEmail: account.email,
        actorRole: account.role,
        customerId: account.customerId,
        detail: reason,
        meta: { status: live.status, ip },
      });
      return NextResponse.json(
        { error: reason, code: "PORTAL_LOCKED", status: live.status },
        { status: 403 }
      );
    }
    customerName = live.name;
  }

  const user = {
    accountId: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    customerId: account.customerId,
    customerName,
    team: account.team,
    title: account.title,
  };

  writeAudit({
    action: "auth.login",
    actorAccountId: account.id,
    actorEmail: account.email,
    actorRole: account.role,
    customerId: account.customerId,
    detail: "Signed in (demo)",
    meta: { ip },
  });

  const res = NextResponse.json({ ok: true, user });
  return applySessionCookie(res, {
    accountId: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    customerId: account.customerId,
    customerName,
    team: account.team,
    title: account.title,
  });
}

export async function DELETE(request: NextRequest) {
  const session = await readSessionFromRequest(request);
  if (session) {
    writeAudit({
      action: "auth.logout",
      actorAccountId: session.accountId,
      actorEmail: session.email,
      actorRole: session.role,
      customerId: session.customerId,
      detail: "Signed out",
    });
  }
  const res = NextResponse.json({ ok: true });
  return clearSessionCookie(res);
}
