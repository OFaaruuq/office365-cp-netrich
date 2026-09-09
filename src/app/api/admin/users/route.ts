import { NextRequest, NextResponse } from "next/server";
import { requirePartnerAdmin } from "@/lib/auth/guards";
import { findCustomer, loadCustomers } from "@/lib/customer-store";
import {
  createClientAdminAccount,
  createStaffAccount,
  deletePortalAccount,
  getPortalAccount,
  listClientAdminAccounts,
  listStaffAccounts,
  updateClientAdminAccount,
  updateStaffAccount,
} from "@/lib/account-store";
import { mfaStatusFor, resetMfa } from "@/lib/auth/mfa";
import {
  clearAccountPassword,
  hasCustomPassword,
  setAccountPassword,
} from "@/lib/auth/password-store";
import { writeAudit } from "@/lib/audit-log";
import { isDemoLoginAllowed } from "@/lib/auth/demo-mode";
import type { PortalRole } from "@/lib/tenancy-types";

function withExtras(accountId: string) {
  return {
    mfa: mfaStatusFor(accountId),
    hasCustomPassword: hasCustomPassword(accountId),
  };
}

/** Super Admin — list Client Admins and/or Portal staff */
export async function GET(request: NextRequest) {
  const auth = await requirePartnerAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId") || undefined;
  const scope = (url.searchParams.get("scope") || "clients") as "clients" | "staff" | "all";

  const customers = loadCustomers();
  const nameById = Object.fromEntries(customers.map((c) => [c.id, c.name]));

  const mapRow = (a: ReturnType<typeof listStaffAccounts>[number]) => ({
    ...a,
    customerName: a.customerId ? nameById[a.customerId] : undefined,
    ...withExtras(a.id),
  });

  if (scope === "staff") {
    return NextResponse.json({
      accounts: listStaffAccounts().map(mapRow),
      scope: "staff",
      policy: { onlySuperAdminResetsMfa: true, onlySuperAdminChangesPassword: true },
    });
  }

  if (scope === "all") {
    return NextResponse.json({
      accounts: [...listStaffAccounts(), ...listClientAdminAccounts()].map(mapRow),
      scope: "all",
      policy: { onlySuperAdminResetsMfa: true, onlySuperAdminChangesPassword: true },
    });
  }

  const accounts = listClientAdminAccounts(customerId).map(mapRow);
  return NextResponse.json({
    accounts,
    customerId: customerId || null,
    scope: "clients",
    policy: {
      onlySuperAdminResetsMfa: true,
      onlySuperAdminChangesPassword: true,
      onlySuperAdminManagesClientAdmins: true,
    },
  });
}

/** Super Admin — create Client Admin or Portal staff (optional initial password) */
export async function POST(request: NextRequest) {
  const auth = await requirePartnerAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const kind = String(body.kind || "client");
  const password = body.password != null ? String(body.password) : "";
  if (!password && !isDemoLoginAllowed()) {
    return NextResponse.json(
      {
        error: "Password required (at least 12 characters, including letters and numbers).",
        code: "PASSWORD_REQUIRED",
      },
      { status: 400 }
    );
  }

  if (kind === "staff") {
    const role = String(body.role || "") as PortalRole;
    if (
      role !== "partner_admin" &&
      role !== "support_technical" &&
      role !== "support_billing"
    ) {
      return NextResponse.json(
        { error: "role must be partner_admin, support_technical, or support_billing" },
        { status: 400 }
      );
    }
    const result = createStaffAccount({
      name: String(body.name || ""),
      email: String(body.email || ""),
      role,
    });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    if (password) {
      const pwd = setAccountPassword(result.id, password, auth.session.email);
      if ("error" in pwd) return NextResponse.json(pwd, { status: 400 });
    }
    writeAudit({
      action: "users.create",
      actorAccountId: auth.session.accountId,
      actorEmail: auth.session.email,
      actorRole: auth.session.role,
      detail: `Created staff ${result.role} ${result.email}`,
      meta: { accountId: result.id, passwordSet: Boolean(password) },
    });
    return NextResponse.json({
      account: { ...result, ...withExtras(result.id) },
      message: password
        ? "Staff account created with custom password. MFA enrollment required on first sign-in."
        : "Staff account created with the shared demo password. MFA enrollment required on first sign-in.",
    });
  }

  const customerId = String(body.customerId || "");
  if (!customerId || !findCustomer(customerId)) {
    return NextResponse.json({ error: "Valid customerId required" }, { status: 400 });
  }

  const result = createClientAdminAccount({
    customerId,
    name: String(body.name || ""),
    email: String(body.email || ""),
  });
  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }
  if (password) {
    const pwd = setAccountPassword(result.id, password, auth.session.email);
    if ("error" in pwd) return NextResponse.json(pwd, { status: 400 });
  }

  writeAudit({
    action: "users.create",
    actorAccountId: auth.session.accountId,
    actorEmail: auth.session.email,
    actorRole: auth.session.role,
    customerId,
    detail: `Created Client Admin ${result.email}`,
    meta: { accountId: result.id, passwordSet: Boolean(password) },
  });

  return NextResponse.json({
    account: { ...result, ...withExtras(result.id) },
    message: password
      ? "Client Admin created with custom password. MFA enrollment required on first sign-in."
      : "Client Admin created with the shared demo password. MFA enrollment required on first sign-in.",
  });
}

/**
 * Super Admin — update profile, password, MFA reset, enable/disable, delete.
 * Body actions: reset_mfa | set_password | clear_password | disable | enable | delete | (default update)
 */
export async function PATCH(request: NextRequest) {
  const auth = await requirePartnerAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const accountId = String(body.accountId || "");
  const account = getPortalAccount(accountId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const action = String(body.action || "");

  if (action === "delete") {
    if (accountId === auth.session.accountId) {
      return NextResponse.json(
        { error: "You cannot delete your own account.", code: "SELF_DELETE" },
        { status: 400 }
      );
    }
    const result = deletePortalAccount(accountId);
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    resetMfa(accountId);
    clearAccountPassword(accountId);
    writeAudit({
      action: "users.delete",
      actorAccountId: auth.session.accountId,
      actorEmail: auth.session.email,
      actorRole: auth.session.role,
      customerId: account.customerId,
      detail: `Deleted ${account.role} ${account.email}`,
      meta: { accountId, targetRole: account.role },
    });
    return NextResponse.json({
      ok: true,
      deleted: true,
      account: result.account,
      message: `User ${account.email} deleted.`,
    });
  }

  if (action === "reset_mfa") {
    resetMfa(accountId);
    writeAudit({
      action: "auth.mfa_reset",
      actorAccountId: auth.session.accountId,
      actorEmail: auth.session.email,
      actorRole: auth.session.role,
      customerId: account.customerId,
      detail: `MFA reset for ${account.email} (${account.role})`,
      meta: { accountId, targetRole: account.role },
    });
    return NextResponse.json({
      ok: true,
      account: { ...account, ...withExtras(accountId) },
      message: "MFA reset. User must enroll Google Authenticator on next sign-in.",
    });
  }

  if (action === "set_password") {
    const pwd = setAccountPassword(
      accountId,
      String(body.password || ""),
      auth.session.email
    );
    if ("error" in pwd) return NextResponse.json(pwd, { status: 400 });
    writeAudit({
      action: "users.password_change",
      actorAccountId: auth.session.accountId,
      actorEmail: auth.session.email,
      actorRole: auth.session.role,
      customerId: account.customerId,
      detail: `Password set for ${account.email}`,
      meta: { accountId },
    });
    return NextResponse.json({
      ok: true,
      account: { ...account, ...withExtras(accountId) },
      message: "Password updated. User must use the new password on next sign-in.",
    });
  }

  if (action === "clear_password") {
    if (!isDemoLoginAllowed()) {
      return NextResponse.json(
        {
          error: "Cannot clear a password while demo login is disabled. Set a new password instead.",
          code: "PASSWORD_REQUIRED",
        },
        { status: 400 }
      );
    }
    clearAccountPassword(accountId);
    writeAudit({
      action: "users.password_change",
      actorAccountId: auth.session.accountId,
      actorEmail: auth.session.email,
      actorRole: auth.session.role,
      customerId: account.customerId,
      detail: `Password cleared for ${account.email} (reverts to default demo password)`,
      meta: { accountId },
    });
    return NextResponse.json({
      ok: true,
      account: { ...account, ...withExtras(accountId) },
      message: "Custom password cleared. Account uses the default demo password again.",
    });
  }

  const isClient = account.role === "customer_admin";
  const isStaff =
    account.role === "partner_admin" ||
    account.role === "support_technical" ||
    account.role === "support_billing";

  if (!isClient && !isStaff) {
    return NextResponse.json({ error: "Unsupported account type" }, { status: 400 });
  }

  if (action === "disable" || action === "enable") {
    if (action === "disable" && accountId === auth.session.accountId) {
      return NextResponse.json(
        { error: "You cannot disable your own account.", code: "SELF_DISABLE" },
        { status: 400 }
      );
    }

    const result = isClient
      ? updateClientAdminAccount({ accountId, disabled: action === "disable" })
      : updateStaffAccount({ accountId, disabled: action === "disable" });

    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    writeAudit({
      action: "users.update",
      actorAccountId: auth.session.accountId,
      actorEmail: auth.session.email,
      actorRole: auth.session.role,
      customerId: result.customerId,
      detail: `${action} ${result.role} ${result.email}`,
      meta: { accountId },
    });
    return NextResponse.json({
      account: { ...result, ...withExtras(result.id) },
      message: action === "disable" ? "Account disabled." : "Account enabled.",
    });
  }

  const result = isClient
    ? updateClientAdminAccount({
        accountId,
        name: body.name,
        email: body.email,
        disabled: body.disabled,
      })
    : updateStaffAccount({
        accountId,
        name: body.name,
        email: body.email,
        disabled: body.disabled,
      });

  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }

  writeAudit({
    action: "users.update",
    actorAccountId: auth.session.accountId,
    actorEmail: auth.session.email,
    actorRole: auth.session.role,
    customerId: result.customerId,
    detail: `Updated ${result.role} ${result.email}`,
    meta: { accountId },
  });

  return NextResponse.json({
    account: { ...result, ...withExtras(result.id) },
    message: "User profile saved.",
  });
}
