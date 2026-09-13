import { NextRequest, NextResponse } from "next/server";
import { denyInspectWrite, resolveTenantScope } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit-log";
import { listDirectoryUsers, replaceDirectoryUsers } from "@/lib/directory-store";
import { findCustomer } from "@/lib/customer-store";
import { cspApiBase, cspInternalHeaders } from "@/lib/csp-api";
import { SESSION_COOKIE, LEGACY_SESSION_COOKIE } from "@/lib/auth/server-session";
import { syncUsersFromGraph } from "@/lib/graph";

/**
 * Directory sync is tenant-scoped.
 * Live Graph runs only with an app/SAM token for THIS customer's Entra tenant.
 * Never stamps syncedFromGraph on local JSON without a Graph response.
 */
export async function POST(request: NextRequest) {
  const scope = await resolveTenantScope(request);
  if ("error" in scope) return scope.error;
  const blocked = denyInspectWrite(scope);
  if (blocked) return blocked;

  const customer = findCustomer(scope.customerId);
  if (!customer) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const sessionToken =
    request.cookies.get(SESSION_COOKIE)?.value || request.cookies.get(LEGACY_SESSION_COOKIE)?.value;

  try {
    const nest = await fetch(`${cspApiBase()}/v1/directory/sync`, {
      method: "POST",
      headers: cspInternalHeaders(scope.session, scope.customerId, sessionToken),
      body: JSON.stringify({ customerId: scope.customerId, entraTenantId: customer.microsoftTenantId }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (nest.ok) {
      const data = (await nest.json()) as { users?: ReturnType<typeof listDirectoryUsers>; source?: string };
      if (Array.isArray(data.users)) {
        replaceDirectoryUsers(scope.customerId, data.users);
      }
      writeAudit({
        action: "users.sync",
        actorAccountId: scope.session.accountId,
        actorEmail: scope.session.email,
        actorRole: scope.session.role,
        customerId: scope.customerId,
        detail: `Graph directory sync (${data.users?.length || 0} users)`,
        result: "ok",
      });
      return NextResponse.json({
        users: data.users || listDirectoryUsers(scope.customerId),
        count: data.users?.length || 0,
        source: data.source || "nest",
        customerId: scope.customerId,
        syncedAt: new Date().toISOString(),
      });
    }
    if (nest.status === 409) {
      const data = await nest.json().catch(() => ({}));
      return NextResponse.json(
        {
          error:
            (data as { message?: string }).message ||
            "Microsoft Graph is not configured for this tenant. Directory remains local.",
          code: "GRAPH_NOT_CONFIGURED",
          customerId: scope.customerId,
          users: listDirectoryUsers(scope.customerId),
          source: "local",
        },
        { status: 409 }
      );
    }
  } catch {
    /* Nest down — try process-local Graph credentials */
  }

  const graphToken = process.env.GRAPH_ACCESS_TOKEN || "";
  if (graphToken) {
    try {
      const users = await syncUsersFromGraph(graphToken);
      replaceDirectoryUsers(scope.customerId, users);
      writeAudit({
        action: "users.sync",
        actorAccountId: scope.session.accountId,
        actorEmail: scope.session.email,
        actorRole: scope.session.role,
        customerId: scope.customerId,
        detail: `Graph directory sync via GRAPH_ACCESS_TOKEN (${users.length} users)`,
        result: "ok",
      });
      return NextResponse.json({
        users,
        count: users.length,
        source: "graph",
        customerId: scope.customerId,
        syncedAt: new Date().toISOString(),
      });
    } catch (err) {
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "Graph sync failed",
          code: "GRAPH_SYNC_FAILED",
          customerId: scope.customerId,
        },
        { status: 502 }
      );
    }
  }

  return NextResponse.json(
    {
      error:
        "Live Graph directory sync is not configured (set Graph app credentials on the Nest API). Local directory was not altered.",
      code: "GRAPH_NOT_CONFIGURED",
      customerId: scope.customerId,
      users: listDirectoryUsers(scope.customerId),
      source: "local",
    },
    { status: 409 }
  );
}
