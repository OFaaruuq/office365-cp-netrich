import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  requireCustomerResource,
  requirePartnerAdmin,
  requireSession,
  resolveTenantScope,
} from "@/lib/auth/guards";
import type { ServerSession } from "@/lib/auth/server-session";

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
