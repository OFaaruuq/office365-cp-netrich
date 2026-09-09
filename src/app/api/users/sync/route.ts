import { NextRequest, NextResponse } from "next/server";
import { denyInspectWrite, resolveTenantScope } from "@/lib/auth/guards";
import { getTenantWorkspace } from "@/lib/tenant-workspace";
import { writeAudit } from "@/lib/audit-log";

/**
 * Sync is tenant-scoped only. Graph bearer import is disabled in demo so a token
 * from one Microsoft tenant cannot be labeled as another customerId.
 */
export async function POST(request: NextRequest) {
  const scope = await resolveTenantScope(request);
  if ("error" in scope) return scope.error;
  const blocked = denyInspectWrite(scope);
  if (blocked) return blocked;

  const graphAuth = request.headers.get("authorization");
  if (graphAuth?.startsWith("Bearer ")) {
    return NextResponse.json(
      {
        error:
          "Live Graph directory import is disabled in demo to enforce hard tenant isolation. Use per-tenant workspace sync.",
        code: "GRAPH_IMPORT_DISABLED",
        customerId: scope.customerId,
      },
      { status: 403 }
    );
  }

  const workspace = getTenantWorkspace(scope.customerId);
  if (!workspace) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const synced = workspace.users.map((u) => ({
    ...u,
    syncedFromGraph: true,
    lastSyncedAt: new Date().toISOString(),
  }));

  writeAudit({
    action: "users.sync",
    actorAccountId: scope.session.accountId,
    actorEmail: scope.session.email,
    actorRole: scope.session.role,
    customerId: scope.customerId,
    detail: `Synced ${synced.length} users in isolated tenant`,
    meta: { inspect: scope.inspect },
  });

  return NextResponse.json({
    users: synced,
    count: synced.length,
    source: "tenant-isolated",
    customerId: workspace.customerId,
    syncedAt: new Date().toISOString(),
    message:
      "Isolated demo sync for this tenant only. Other client tenants cannot see these users.",
  });
}
