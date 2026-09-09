import { NextRequest, NextResponse } from "next/server";
import {
  activeInspect,
  clearSessionCookie,
  readSessionFromRequest,
  type ServerSession,
} from "@/lib/auth/server-session";
import { findCustomer } from "@/lib/customer-store";
import { writeAudit } from "@/lib/audit-log";
import type { PortalRole, SupportThread } from "@/lib/tenancy-types";

export function denyInspectWrite(scope: { inspect: boolean }): NextResponse | null {
  if (!scope.inspect) return null;
  return NextResponse.json(
    { error: "View-as-customer is read-only", code: "READ_ONLY" },
    { status: 403 }
  );
}

/** Blocks mutations while a partner view-as session is bound to the cookie. */
export function denyActiveInspectWrite(session: ServerSession): NextResponse | null {
  if (!activeInspect(session)) return null;
  return NextResponse.json(
    { error: "View-as-customer is read-only", code: "READ_ONLY" },
    { status: 403 }
  );
}

export function unauthorized(message = "Authentication required") {
  return NextResponse.json({ error: message, code: "UNAUTHORIZED" }, { status: 401 });
}

export function forbidden(message: string, code = "FORBIDDEN") {
  return NextResponse.json({ error: message, code }, { status: 403 });
}

/**
 * Re-check live tenant status for client sessions.
 * Suspend / reject / lock after login immediately blocks workspace APIs.
 */
export function assertClientPortalActive(
  session: ServerSession
): NextResponse | null {
  if (session.role !== "customer_admin") return null;
  if (!session.customerId) {
    return forbidden("Session is not bound to a client tenant.", "NO_TENANT");
  }
  const customer = findCustomer(session.customerId);
  if (!customer) {
    return forbidden("Client tenant not found.", "TENANT_NOT_FOUND");
  }
  if (customer.status !== "active" || !customer.config?.portalAccessEnabled) {
    writeAudit({
      action: "portal.locked_out",
      actorAccountId: session.accountId,
      actorEmail: session.email,
      actorRole: session.role,
      customerId: session.customerId,
      detail: `Portal blocked — status=${customer.status}, access=${customer.config?.portalAccessEnabled}`,
    });
    const res = NextResponse.json(
      {
        error:
          "Portal access revoked for this tenant. Contact netrichtechnologies Super Admin.",
        code: "PORTAL_LOCKED",
        status: customer.status,
      },
      { status: 403 }
    );
    clearSessionCookie(res);
    return res;
  }
  return null;
}

export async function requireSession(
  request: NextRequest,
  opts?: { skipPortalCheck?: boolean }
): Promise<{ session: ServerSession } | { error: NextResponse }> {
  const session = await readSessionFromRequest(request);
  if (!session) return { error: unauthorized() };
  if (!opts?.skipPortalCheck) {
    const locked = assertClientPortalActive(session);
    if (locked) return { error: locked };
  }
  return { session };
}

export async function requireRoles(
  request: NextRequest,
  roles: PortalRole[],
  opts?: { skipPortalCheck?: boolean }
): Promise<{ session: ServerSession } | { error: NextResponse }> {
  const auth = await requireSession(request, opts);
  if ("error" in auth) return auth;
  if (!roles.includes(auth.session.role)) {
    return {
      error: forbidden(
        `Role ${auth.session.role} cannot access this resource.`,
        "ROLE_DENIED"
      ),
    };
  }
  return auth;
}

export async function requirePartnerAdmin(request: NextRequest) {
  return requireRoles(request, ["partner_admin"]);
}

/** Client admin may only operate inside their bound customerId */
export async function requireClientTenant(
  request: NextRequest,
  requestedCustomerId?: string | null
): Promise<{ session: ServerSession; customerId: string } | { error: NextResponse }> {
  const auth = await requireRoles(request, ["customer_admin"]);
  if ("error" in auth) return auth;
  const customerId = auth.session.customerId;
  if (!customerId) {
    return { error: forbidden("Session is not bound to a client tenant.", "NO_TENANT") };
  }
  if (requestedCustomerId && requestedCustomerId !== customerId) {
    return {
      error: forbidden(
        "Cross-tenant access denied. Each client tenant is strictly isolated.",
        "TENANT_ISOLATION"
      ),
    };
  }
  return { session: auth.session, customerId };
}

/**
 * Access a specific customer resource (path id or explicit id).
 * Never trusts x-customer-id. Support is denied.
 */
export async function requireCustomerResource(
  request: NextRequest,
  customerId: string | null | undefined
): Promise<
  | { session: ServerSession; customerId: string; inspect: boolean }
  | { error: NextResponse }
> {
  const auth = await requireSession(request);
  if ("error" in auth) return auth;
  const { session } = auth;
  const id = String(customerId || "").trim();
  if (!id) {
    return {
      error: NextResponse.json(
        { error: "Specify customerId to open an isolated tenant workspace.", code: "CUSTOMER_REQUIRED" },
        { status: 400 }
      ),
    };
  }

  if (session.role === "partner_admin") {
    if (!findCustomer(id)) {
      return { error: NextResponse.json({ error: "Tenant not found" }, { status: 404 }) };
    }
    return { session, customerId: id, inspect: true };
  }

  if (session.role === "customer_admin") {
    if (!session.customerId) {
      return { error: forbidden("Session is not bound to a client tenant.", "NO_TENANT") };
    }
    if (id !== session.customerId) {
      return {
        error: forbidden(
          "Cross-tenant access denied. Each client tenant is strictly isolated.",
          "TENANT_ISOLATION"
        ),
      };
    }
    return { session, customerId: session.customerId, inspect: false };
  }

  return {
    error: forbidden(
      "Support agents cannot access client tenant workspaces. Use the support inbox.",
      "SUPPORT_NO_TENANT_WORKSPACE"
    ),
  };
}

/**
 * Unified tenant scope for workspace APIs.
 * - customer_admin → forced to session.customerId (query ignored)
 * - partner_admin → must pass ?customerId= (inspect mode); audited by caller
 * - support → denied
 * Never trusts x-customer-id header.
 */
export async function resolveTenantScope(
  request: NextRequest
): Promise<
  | { session: ServerSession; customerId: string; inspect: boolean }
  | { error: NextResponse }
> {
  const auth = await requireSession(request);
  if ("error" in auth) return auth;
  const { session } = auth;

  if (session.role === "customer_admin") {
    if (!session.customerId) {
      return { error: forbidden("Session is not bound to a client tenant.", "NO_TENANT") };
    }
    const requested = new URL(request.url).searchParams.get("customerId");
    if (requested && requested !== session.customerId) {
      return {
        error: forbidden(
          "Cross-tenant access denied. Each client tenant is strictly isolated.",
          "TENANT_ISOLATION"
        ),
      };
    }
    return { session, customerId: session.customerId, inspect: false };
  }

  if (session.role === "partner_admin") {
    const customerId = new URL(request.url).searchParams.get("customerId");
    if (!customerId) {
      return {
        error: NextResponse.json(
          {
            error: "Specify customerId to open an isolated tenant workspace.",
            code: "CUSTOMER_REQUIRED",
          },
          { status: 400 }
        ),
      };
    }
    if (!findCustomer(customerId)) {
      return { error: NextResponse.json({ error: "Tenant not found" }, { status: 404 }) };
    }
    return { session, customerId, inspect: true };
  }

  return {
    error: forbidden(
      "Support agents cannot access client tenant workspaces. Use the support inbox.",
      "SUPPORT_NO_TENANT_WORKSPACE"
    ),
  };
}

export function assertThreadAccess(
  session: ServerSession,
  thread: SupportThread
): NextResponse | null {
  if (session.role === "partner_admin") return null;

  if (session.role === "customer_admin") {
    if (!session.customerId || thread.customerId !== session.customerId) {
      return forbidden(
        "Cross-tenant chat access denied. Tenants are isolated.",
        "TENANT_ISOLATION"
      );
    }
    return null;
  }

  if (session.role === "support_technical" || session.role === "support_billing") {
    if (!session.team || thread.team !== session.team) {
      return forbidden(
        "Agents may only access their own support team queue.",
        "TEAM_ISOLATION"
      );
    }
    return null;
  }

  return forbidden("No access to this thread.", "THREAD_DENIED");
}
