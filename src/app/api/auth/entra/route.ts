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
import { verifyEntraJwt } from "@/lib/auth/entra-token";
import { bootstrapAdminEmail } from "@/lib/auth/demo-mode";
import { createStaffAccount, getPortalAccount } from "@/lib/account-store";
import type { PortalAccount } from "@/lib/tenancy-types";

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

function provisionBootstrapAdmin(email: string, name: string, oid?: string, tid?: string): PortalAccount | undefined {
  if (email !== bootstrapAdminEmail()) return undefined;
  const existing = findPortalAccountByEmail(email);
  if (existing) return existing;
  const created = createStaffAccount({
    name: name || "Partner Super Admin",
    email,
    role: "partner_admin",
  });
  if ("error" in created) return undefined;
  if (oid) bindEntraIdentity(created.id, { oid, tid });
  return getPortalAccount(created.id);
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
  if (!accessToken) {
    return NextResponse.json({ error: "accessToken is required", code: "MISSING_TOKEN" }, { status: 400 });
  }

  const jwtClaims = await verifyEntraJwt(accessToken);
  let email = jwtClaims
    ? String(jwtClaims.preferred_username || jwtClaims.email || jwtClaims.upn || "").trim().toLowerCase()
    : "";
  let displayName = jwtClaims?.name ? String(jwtClaims.name) : "";
  let graphOk = false;

  try {
    const me = await getMe(accessToken);
    graphOk = true;
    email = String(me.mail || me.userPrincipalName || "").trim().toLowerCase() || email;
    displayName = me.displayName || displayName;
  } catch {
    graphOk = false;
  }

  if (!jwtClaims && !graphOk) {
    return NextResponse.json(
      { error: "Microsoft token could not be verified.", code: "TOKEN_INVALID" },
      { status: 401 }
    );
  }

  if (!email) {
    return NextResponse.json(
      { error: "Could not resolve a Microsoft identity email from the token.", code: "IDENTITY_UNRESOLVED" },
      { status: 401 }
    );
  }

  let account: PortalAccount | undefined =
    (jwtClaims?.oid ? findPortalAccountByEntraOid(String(jwtClaims.oid)) : undefined) ||
    findPortalAccountByEmail(email) ||
    provisionBootstrapAdmin(email, displayName, jwtClaims?.oid ? String(jwtClaims.oid) : undefined, jwtClaims?.tid ? String(jwtClaims.tid) : undefined);

  if (!account || account.disabled || account.deleted) {
    writeAudit({
      action: "auth.login_denied",
      actorAccountId: "unknown",
      actorEmail: email,
      actorRole: "unknown",
      detail: "Entra SSO — portal account not provisioned",
      meta: { ip, oid: jwtClaims?.oid || null, tid: jwtClaims?.tid || null },
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

  bindEntraIdentity(account.id, {
    oid: jwtClaims?.oid ? String(jwtClaims.oid) : undefined,
    tid: jwtClaims?.tid ? String(jwtClaims.tid) : undefined,
  });

  writeAudit({
    action: "auth.login",
    actorAccountId: account.id,
    actorEmail: account.email,
    actorRole: account.role,
    customerId: account.customerId,
    detail: "Signed in with Microsoft Entra ID",
    meta: { ip, oid: jwtClaims?.oid || null, tid: jwtClaims?.tid || null },
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
