import { NextRequest, NextResponse } from "next/server";
import { getCustomer } from "@/lib/tenancy-data";
import { findPortalAccountByEmail, getPortalAccount } from "@/lib/account-store";
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
import { verifyAccountPassword } from "@/lib/auth/password-store";
import {
  beginMfaEnrollment,
  createMfaChallenge,
  isMfaEnabled,
  mfaQrDataUrl,
} from "@/lib/auth/mfa";
import type { PortalAccount } from "@/lib/tenancy-types";

export async function GET(request: NextRequest) {
  const session = await readSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({
      authenticated: false,
      user: null,
      demoLogin: isDemoLoginAllowed(),
      mfaRequired: true,
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
    mfaRequired: true,
  });
}

function denyLogin(ip: string, detail: string, account?: PortalAccount) {
  writeAudit({
    action: "auth.login_denied",
    actorAccountId: account?.id || "unknown",
    actorEmail: account?.email || "unknown",
    actorRole: account?.role || "unknown",
    customerId: account?.customerId,
    detail,
    meta: { ip },
  });
  return NextResponse.json(
    { error: "Invalid email or password.", code: "INVALID_CREDENTIALS" },
    { status: 401 }
  );
}

async function resolveCustomerGate(account: PortalAccount): Promise<
  | { ok: true; customerName?: string }
  | { ok: false; response: NextResponse }
> {
  if (account.role !== "customer_admin") return { ok: true };
  if (!account.customerId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Client account is not bound to a tenant.", code: "PORTAL_LOCKED" },
        { status: 403 }
      ),
    };
  }
  const live = findCustomer(account.customerId) || getCustomer(account.customerId);
  if (!live) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Client tenant not found.", code: "PORTAL_LOCKED" },
        { status: 404 }
      ),
    };
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
      meta: { status: live.status },
    });
    return {
      ok: false,
      response: NextResponse.json(
        { error: reason, code: "PORTAL_LOCKED", status: live.status },
        { status: 403 }
      ),
    };
  }
  return { ok: true, customerName: live.name };
}

/**
 * Step 1: email + password.
 * Does NOT issue a session — MFA enrollment or TOTP verify is mandatory for every account/tenant.
 */
export async function POST(request: NextRequest) {
  const bodyPreview = await request.clone().json().catch(() => ({}));
  const emailPreview = String(bodyPreview.email || "").trim().toLowerCase();
  const { loadPlatform } = await import("@/lib/platform-store");
  const isBreakGlass = loadPlatform().breakGlassEmails.includes(emailPreview);

  if (!isDemoLoginAllowed() && !isBreakGlass) {
    return NextResponse.json(
      {
        error:
          "Credential demo login is disabled. Configure Microsoft Entra ID (MSAL) or set ALLOW_DEMO_LOGIN=true for staging demos.",
        code: "DEMO_LOGIN_DISABLED",
      },
      { status: 403 }
    );
  }

  const ip = clientIp(request);
  const limitedIp = rateLimit(`login:ip:${ip}`, 8, 60_000);
  if (!limitedIp.ok) {
    return NextResponse.json(
      {
        error: "Too many sign-in attempts. Try again shortly.",
        code: "RATE_LIMITED",
        retryAfterSec: limitedIp.retryAfterSec,
      },
      { status: 429 }
    );
  }
  if (emailPreview) {
    const limitedEmail = rateLimit(`login:email:${emailPreview}`, 5, 60_000);
    if (!limitedEmail.ok) {
      return NextResponse.json(
        {
          error: "Too many sign-in attempts. Try again shortly.",
          code: "RATE_LIMITED",
          retryAfterSec: limitedEmail.retryAfterSec,
        },
        { status: 429 }
      );
    }
  }

  const body = bodyPreview;
  const email = emailPreview;
  const password = String(body.password || "");
  const accountId = String(body.accountId || "").trim();

  let account: PortalAccount | undefined;

  if (email) {
    account = findPortalAccountByEmail(email);
    if (!account) {
      return denyLogin(ip, "Unknown email");
    }
    if (!verifyAccountPassword(account.id, password)) {
      return denyLogin(ip, "Bad password", account);
    }
    if (account.disabled) {
      writeAudit({
        action: "auth.login_denied",
        actorAccountId: account.id,
        actorEmail: account.email,
        actorRole: account.role,
        customerId: account.customerId,
        detail: "Account disabled by Super Admin",
        meta: { ip },
      });
      return NextResponse.json(
        {
          error: "This account is disabled. Contact netrichtechnologies Super Admin.",
          code: "ACCOUNT_DISABLED",
        },
        { status: 403 }
      );
    }
  } else if (accountId) {
    account = getPortalAccount(accountId);
    if (!account) {
      return denyLogin(ip, "Unknown account id");
    }
    if (!verifyAccountPassword(account.id, password)) {
      return denyLogin(ip, "Bad password", account);
    }
    if (account.disabled) {
      return NextResponse.json(
        {
          error: "This account is disabled. Contact netrichtechnologies Super Admin.",
          code: "ACCOUNT_DISABLED",
        },
        { status: 403 }
      );
    }
  } else {
    return NextResponse.json(
      { error: "Email and password are required.", code: "MISSING_CREDENTIALS" },
      { status: 400 }
    );
  }

  const gate = await resolveCustomerGate(account);
  if (!gate.ok) return gate.response;

  const enrolled = isMfaEnabled(account.id);
  const purpose = enrolled ? "verify" : "enroll";

  const challengeId = createMfaChallenge({
    accountId: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    customerId: account.customerId,
    customerName: gate.customerName,
    team: account.team,
    title: account.title,
    purpose,
  });

  writeAudit({
    action: "auth.mfa_challenge",
    actorAccountId: account.id,
    actorEmail: account.email,
    actorRole: account.role,
    customerId: account.customerId,
    detail: enrolled ? "Password OK — MFA code required" : "Password OK — MFA enrollment required",
    meta: { ip, purpose },
  });

  if (enrolled) {
    return NextResponse.json({
      ok: false,
      mfaRequired: true,
      step: "verify",
      challengeId,
      message: "Enter the 6-digit code from Google Authenticator (or any TOTP app).",
    });
  }

  const setup = beginMfaEnrollment(account.id, account.email);
  const qrDataUrl = await mfaQrDataUrl(setup.otpauthUrl);

  return NextResponse.json({
    ok: false,
    mfaRequired: true,
    step: "enroll",
    challengeId,
    otpauthUrl: setup.otpauthUrl,
    qrDataUrl,
    secret: setup.secret,
    message:
      "MFA is required for all users. Scan the QR code with Google Authenticator, then enter the 6-digit code to finish sign-in.",
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
