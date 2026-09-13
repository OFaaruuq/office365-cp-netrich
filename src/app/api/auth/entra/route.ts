import { NextRequest, NextResponse } from "next/server";
import {
  bindEntraIdentity,
  findPortalAccountByEmail,
  findPortalAccountByEntraOid,
} from "@/lib/account-store";
import { getCustomer } from "@/lib/tenancy-data";
import { findCustomer } from "@/lib/customer-store";
import { applySessionCookie } from "@/lib/auth/server-session";
import { writeAudit } from "@/lib/audit-log";
import { getMe } from "@/lib/graph";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { PortalAccount } from "@/lib/tenancy-types";

function claimsFromJwt(token: string): { oid?: string; tid?: string; email?: string; name?: string } {
  try {
    const payload = token.split(".")[1];
    if (!payload) return {};
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return {
      oid: parsed.oid ? String(parsed.oid) : undefined,
      tid: parsed.tid ? String(parsed.tid) : undefined,
      email: String(parsed.preferred_username || parsed.email || parsed.upn || "").toLowerCase() || undefined,
      name: parsed.name ? String(parsed.name) : undefined,
    };
  } catch {
    return {};
  }
}

function customerGate(account: PortalAccount): { ok: true; customerName?: string } | { ok: false; error: string } {
  if (account.role !== "customer_admin") return { ok: true };
  if (!account.customerId) return { ok: false, error: "Client account is not bound to a tenant." };
  const live = findCustomer(account.customerId) || getCustomer(account.customerId);
  if (!live) return { ok: false, error: "Client tenant not found." };
  if (live.status !== "active" || !live.config?.portalAccessEnabled) {
    return { ok: false, error: "Portal access is locked for this tenant. Contact netrichtechnologies Super Admin." };
  }
  return { ok: true, customerName: live.name };
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const limited = rateLimit(`entra:${ip}`, 12, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again shortly.", code: "RATE_LIMITED" },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const accessToken = String(body.accessToken || "").trim();
  const idToken = String(body.idToken || "").trim();
  if (!accessToken && !idToken) {
    return NextResponse.json({ error: "accessToken is required", code: "MISSING_TOKEN" }, { status: 400 });
  }

  const jwtClaims = claimsFromJwt(idToken || accessToken);
  let email = jwtClaims.email || "";
  let displayName = jwtClaims.name || "";

  if (accessToken) {
    try {
      const me = await getMe(accessToken);
      email = String(me.mail || me.userPrincipalName || "").trim().toLowerCase() || email;
      displayName = me.displayName || displayName;
    } catch {
      /* Graph /me failed — fall back to ID token claims only if present */
    }
  }

  if (!email) {
    return NextResponse.json(
      { error: "Could not resolve a Microsoft identity email from the token.", code: "IDENTITY_UNRESOLVED" },
      { status: 401 }
    );
  }

  const account =
    (jwtClaims.oid ? findPortalAccountByEntraOid(jwtClaims.oid) : undefined) ||
    findPortalAccountByEmail(email);

  if (!account || account.disabled || account.deleted) {
    writeAudit({
      action: "auth.login_denied",
      actorAccountId: "unknown",
      actorEmail: email,
      actorRole: "unknown",
      detail: "Entra SSO — portal account not provisioned",
      meta: { ip, oid: jwtClaims.oid || null, tid: jwtClaims.tid || null },
    });
    return NextResponse.json(
      {
        error:
          "No portal account is provisioned for this Microsoft identity. Ask netrichtechnologies Super Admin to create the user first.",
        code: "NOT_PROVISIONED",
      },
      { status: 403 }
    );
  }

  const gate = customerGate(account);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error, code: "PORTAL_LOCKED" }, { status: 403 });
  }

  bindEntraIdentity(account.id, { oid: jwtClaims.oid, tid: jwtClaims.tid });

  writeAudit({
    action: "auth.login",
    actorAccountId: account.id,
    actorEmail: account.email,
    actorRole: account.role,
    customerId: account.customerId,
    detail: "Signed in with Microsoft Entra ID",
    meta: { ip, oid: jwtClaims.oid || null, tid: jwtClaims.tid || null },
  });

  const res = NextResponse.json({
    authenticated: true,
    source: "entra",
    user: {
      accountId: account.id,
      name: displayName || account.name,
      email: account.email,
      role: account.role,
      customerId: account.customerId,
      customerName: gate.customerName,
      team: account.team,
      title: account.title,
    },
  });
  await applySessionCookie(res, {
    accountId: account.id,
    name: displayName || account.name,
    email: account.email,
    role: account.role,
    customerId: account.customerId,
    customerName: gate.customerName,
    team: account.team,
    title: account.title,
  });
  return res;
}
