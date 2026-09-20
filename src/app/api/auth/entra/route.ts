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

function tidAllowed(account: PortalAccount, tid: string | undefined): boolean {
  if (!tid) return false;
  if (account.role === "partner_admin") {
    const expected = process.env.AZURE_AD_TENANT_ID || "";
    if (!expected || expected === "common" || expected === "organizations") return true;
    return tid === expected;
  }
  if (account.role === "customer_admin" && account.customerId) {
    const live = findCustomer(account.customerId) || getCustomer(account.customerId);
    const expected = live?.microsoftTenantId || "";
    if (!expected) return true;
    return tid === expected;
  }
  return true;
}

function provisionBootstrapAdmin(email: string, name: string, oid: string, tid?: string): PortalAccount | undefined {
  if (email !== bootstrapAdminEmail()) return undefined;
  const existing = findPortalAccountByEmail(email);
  if (existing) return existing;
  const created = createStaffAccount({
    name: name || "Partner Super Admin",
    email,
    role: "partner_admin",
  });
  if ("error" in created) return undefined;
  bindEntraIdentity(created.id, { oid, tid });
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
  const idToken = String(body.idToken || "").trim();
  const accessToken = String(body.accessToken || "").trim();
  const jwtClaims = await verifyEntraJwt(idToken || accessToken);
  if (!jwtClaims?.oid) {
    return NextResponse.json(
      { error: "Microsoft token could not be verified for this application.", code: "TOKEN_INVALID" },
      { status: 401 }
    );
  }

  let email = String(jwtClaims.preferred_username || jwtClaims.email || jwtClaims.upn || "")
    .trim()
    .toLowerCase();
  let displayName = jwtClaims.name ? String(jwtClaims.name) : "";

  if (accessToken) {
    try {
      const me = await getMe(accessToken);
      email = String(me.mail || me.userPrincipalName || "").trim().toLowerCase() || email;
      displayName = me.displayName || displayName;
    } catch {
      /* profile enrich is optional after a verified JWT */
    }
  }

  if (!email) {
    return NextResponse.json(
      { error: "Could not resolve a Microsoft identity email from the token.", code: "IDENTITY_UNRESOLVED" },
      { status: 401 }
    );
  }

  const oid = String(jwtClaims.oid);
  const tid = jwtClaims.tid ? String(jwtClaims.tid) : undefined;

  let account: PortalAccount | undefined = findPortalAccountByEntraOid(oid);

  if (!account) {
    const byEmail = findPortalAccountByEmail(email);
    if (byEmail && !byEmail.entraOid && tidAllowed(byEmail, tid)) {
      account = bindEntraIdentity(byEmail.id, { oid, tid }) || byEmail;
    }
  }

  if (!account) {
    account = provisionBootstrapAdmin(email, displayName, oid, tid);
  }

  if (!account || account.disabled || account.deleted) {
    writeAudit({
      action: "auth.login_denied",
      actorAccountId: "unknown",
      actorEmail: email,
      actorRole: "unknown",
      detail: "Entra SSO — portal account not provisioned",
      meta: { ip, oid, tid: tid || null },
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

  if (account.entraOid && account.entraOid !== oid) {
    return NextResponse.json(
      { error: "This portal account is bound to a different Microsoft identity.", code: "OID_MISMATCH" },
      { status: 403 }
    );
  }

  if (!tidAllowed(account, tid)) {
    writeAudit({
      action: "auth.login_denied",
      actorAccountId: account.id,
      actorEmail: account.email,
      actorRole: account.role,
      customerId: account.customerId,
      detail: "Entra tenant id does not match the bound portal tenant",
      meta: { ip, oid, tid: tid || null },
    });
    return NextResponse.json(
      { error: "This Microsoft tenant is not authorized for this portal account.", code: "TENANT_ISOLATION" },
      { status: 403 }
    );
  }

  const gate = customerGate(account);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error, code: "PORTAL_LOCKED" }, { status: 403 });
  }

  bindEntraIdentity(account.id, { oid, tid });

  writeAudit({
    action: "auth.login",
    actorAccountId: account.id,
    actorEmail: account.email,
    actorRole: account.role,
    customerId: account.customerId,
    detail: "Signed in with Microsoft Entra ID",
    meta: { ip, oid, tid: tid || null },
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
