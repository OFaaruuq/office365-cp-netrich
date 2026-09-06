import { NextRequest, NextResponse } from "next/server";
import {
  applySessionCookie,
} from "@/lib/auth/server-session";
import { writeAudit } from "@/lib/audit-log";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isDemoLoginAllowed } from "@/lib/auth/demo-mode";
import {
  beginMfaEnrollment,
  confirmMfaEnrollment,
  consumeMfaChallenge,
  getMfaChallenge,
  isMfaEnabled,
  mfaQrDataUrl,
  updateMfaChallenge,
  verifyTotpCode,
} from "@/lib/auth/mfa";
import type { PortalRole, SupportTeam } from "@/lib/tenancy-types";

function issueSession(challenge: NonNullable<ReturnType<typeof consumeMfaChallenge>>) {
  const user = {
    accountId: challenge.accountId,
    name: challenge.name,
    email: challenge.email,
    role: challenge.role as PortalRole,
    customerId: challenge.customerId,
    customerName: challenge.customerName,
    team: challenge.team as SupportTeam | undefined,
    title: challenge.title,
  };
  const res = NextResponse.json({ ok: true, user, mfaVerified: true });
  return applySessionCookie(res, {
    accountId: challenge.accountId,
    name: challenge.name,
    email: challenge.email,
    role: challenge.role as PortalRole,
    customerId: challenge.customerId,
    customerName: challenge.customerName,
    team: challenge.team as SupportTeam | undefined,
    title: challenge.title,
  });
}

/**
 * Complete MFA: verify TOTP or confirm enrollment.
 * Body: { challengeId, code, action?: "verify" | "enroll" | "refresh_setup" }
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const challengeId = String(body.challengeId || "");
  const code = String(body.code || "").trim();
  const action = String(body.action || "verify") as "verify" | "enroll" | "refresh_setup";

  const challengeEarly = getMfaChallenge(challengeId);
  const { loadPlatform } = await import("@/lib/platform-store");
  const isBreakGlass = Boolean(
    challengeEarly && loadPlatform().breakGlassEmails.includes(challengeEarly.email.toLowerCase())
  );

  if (!isDemoLoginAllowed() && !isBreakGlass) {
    return NextResponse.json(
      { error: "Demo login disabled.", code: "DEMO_LOGIN_DISABLED" },
      { status: 403 }
    );
  }

  const ip = clientIp(request);
  const limited = rateLimit(`mfa:${ip}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many MFA attempts. Try again shortly.", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  const challenge = challengeEarly;
  if (!challenge) {
    return NextResponse.json(
      { error: "MFA challenge expired. Sign in again.", code: "MFA_EXPIRED" },
      { status: 401 }
    );
  }

  if (action === "refresh_setup") {
    const setup = beginMfaEnrollment(challenge.accountId, challenge.email);
    updateMfaChallenge(challengeId, { purpose: "enroll", pendingSecret: setup.secret });
    const qrDataUrl = await mfaQrDataUrl(setup.otpauthUrl);
    return NextResponse.json({
      ok: false,
      step: "enroll",
      challengeId,
      otpauthUrl: setup.otpauthUrl,
      qrDataUrl,
      secret: setup.secret,
      message: "Scan the new QR code with Google Authenticator.",
    });
  }

  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: "Enter the 6-digit authenticator code.", code: "MFA_CODE_INVALID" },
      { status: 400 }
    );
  }

  if (challenge.purpose === "enroll" || action === "enroll" || !isMfaEnabled(challenge.accountId)) {
    const ok = confirmMfaEnrollment(challenge.accountId, code);
    if (!ok) {
      writeAudit({
        action: "auth.mfa_failed",
        actorAccountId: challenge.accountId,
        actorEmail: challenge.email,
        actorRole: challenge.role,
        customerId: challenge.customerId,
        detail: "MFA enrollment code rejected",
        meta: { ip },
      });
      return NextResponse.json(
        { error: "Invalid authenticator code. Try again.", code: "MFA_CODE_INVALID" },
        { status: 401 }
      );
    }
    const consumed = consumeMfaChallenge(challengeId);
    if (!consumed) {
      return NextResponse.json(
        { error: "MFA challenge expired. Sign in again.", code: "MFA_EXPIRED" },
        { status: 401 }
      );
    }
    writeAudit({
      action: "auth.mfa_enroll",
      actorAccountId: challenge.accountId,
      actorEmail: challenge.email,
      actorRole: challenge.role,
      customerId: challenge.customerId,
      detail: "MFA enrolled (Google Authenticator / TOTP)",
      meta: { ip },
    });
    writeAudit({
      action: "auth.login",
      actorAccountId: challenge.accountId,
      actorEmail: challenge.email,
      actorRole: challenge.role,
      customerId: challenge.customerId,
      detail: "Signed in after MFA enrollment",
      meta: { ip },
    });
    return issueSession(consumed);
  }

  const ok = verifyTotpCode(challenge.accountId, code);
  if (!ok) {
    writeAudit({
      action: "auth.mfa_failed",
      actorAccountId: challenge.accountId,
      actorEmail: challenge.email,
      actorRole: challenge.role,
      customerId: challenge.customerId,
      detail: "MFA verify code rejected",
      meta: { ip },
    });
    return NextResponse.json(
      { error: "Invalid authenticator code. Try again.", code: "MFA_CODE_INVALID" },
      { status: 401 }
    );
  }

  const consumed = consumeMfaChallenge(challengeId);
  if (!consumed) {
    return NextResponse.json(
      { error: "MFA challenge expired. Sign in again.", code: "MFA_EXPIRED" },
      { status: 401 }
    );
  }

  writeAudit({
    action: "auth.mfa_verify",
    actorAccountId: challenge.accountId,
    actorEmail: challenge.email,
    actorRole: challenge.role,
    customerId: challenge.customerId,
    detail: "MFA verified",
    meta: { ip },
  });
  writeAudit({
    action: "auth.login",
    actorAccountId: challenge.accountId,
    actorEmail: challenge.email,
    actorRole: challenge.role,
    customerId: challenge.customerId,
    detail: "Signed in after MFA",
    meta: { ip },
  });

  return issueSession(consumed);
}
