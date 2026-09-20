import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  requireCustomerResource,
  requirePartnerAdmin,
  requireSession,
  resolveTenantScope,
} from "@/lib/auth/guards";
import type { ServerSession } from "@/lib/auth/server-session";
import { sessionHasPermission } from "@/lib/auth/server-session";

export type CspAccess = {
  session: ServerSession;
  customerId?: string;
  inspect?: boolean;
};

export type CspAuthResult = CspAccess | { error: NextResponse };

const PARTNER_PREFIXES = [
  "gdap",
  "flags",
  "approvals",
  "jobs",
  "reporting",
  "price-lists",
  "quotes",
  "invoices",
  "orders",
  "subscriptions",
  "graph-sync",
  "microsoft",
  "break-glass",
  "catalog",
  "admin-access",
  "onboarding",
] as const;

const PARTNER_PREFIX_PERMISSION: Record<(typeof PARTNER_PREFIXES)[number], string> = {
  gdap: "gdap.read",
  flags: "platform.admin",
  approvals: "platform.admin",
  jobs: "platform.admin",
  reporting: "platform.admin",
  "price-lists": "invoice.read",
  quotes: "quote.read",
  invoices: "invoice.read",
  orders: "subscription.read",
  subscriptions: "subscription.read",
  "graph-sync": "user.read",
  microsoft: "platform.admin",
  "break-glass": "platform.admin",
  catalog: "platform.admin",
  "admin-access": "admin.impersonate",
  onboarding: "tenant.read",
};

function partnerPermissionFor(joined: string): string | null {
  const prefix = PARTNER_PREFIXES.find((p) => matchesPrefix(joined, p));
  if (prefix) return PARTNER_PREFIX_PERMISSION[prefix];
  if (joined === "customers" || joined === "health" || joined === "platform/health") return "tenant.read";
  if (joined === "rbac/roles" || joined === "rbac/permissions") return "platform.admin";
  return "platform.admin";
}

function matchesPrefix(joined: string, prefix: string) {
  return joined === prefix || joined.startsWith(prefix + "/");
}

export function isCspPartnerOnly(joined: string): boolean {
  if (PARTNER_PREFIXES.some((p) => matchesPrefix(joined, p))) return true;
  return (
    joined === "customers" ||
    joined === "health" ||
    joined === "platform/health" ||
    joined === "rbac/roles" ||
    joined === "rbac/permissions"
  );
}

function isTenantForced(joined: string): boolean {
  return (
    joined === "contacts" ||
    joined === "domains" ||
    joined === "groups" ||
    joined === "licenses" ||
    matchesPrefix(joined, "directory") ||
    matchesPrefix(joined, "service-health") ||
    matchesPrefix(joined, "security") ||
    matchesPrefix(joined, "license-optimization") ||
    matchesPrefix(joined, "billing") ||
    joined === "pricing/compute"
  );
}

/**
 * Authenticate a /api/csp/* path before any Nest proxy or local store read.
 * Tenant-forced routes bind to session.customerId (clients) or ?customerId= (partners).
 */
export async function authorizeCspPath(
  request: NextRequest,
  joined: string
): Promise<CspAuthResult> {
  if (isCspPartnerOnly(joined)) {
    const auth = await requirePartnerAdmin(request);
    if ("error" in auth) return auth;
    const needed = partnerPermissionFor(joined);
    if (needed && !sessionHasPermission(auth.session, needed)) {
      return { error: forbidden("Missing required permission.", "RBAC_DENIED") };
    }
    return { session: auth.session };
  }

  if (joined.startsWith("customers/")) {
    const id = joined.slice("customers/".length).split("/")[0];
    return requireCustomerResource(request, id);
  }

  if (isTenantForced(joined)) {
    return resolveTenantScope(request);
  }

  const auth = await requireSession(request);
  if ("error" in auth) return auth;

  const support =
    auth.session.role === "support_technical" || auth.session.role === "support_billing";

  if (
    support &&
    (joined === "audit" ||
      joined === "renewals" ||
      joined === "portal-admins" ||
      joined === "contacts" ||
      joined === "domains")
  ) {
    return {
      error: forbidden(
        "Support agents cannot access client tenant workspaces. Use the support inbox.",
        "SUPPORT_NO_TENANT_WORKSPACE"
      ),
    };
  }

  return {
    session: auth.session,
    customerId: auth.session.customerId,
  };
}
