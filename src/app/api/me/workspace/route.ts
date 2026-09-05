import { NextRequest, NextResponse } from "next/server";
import { resolveTenantScope } from "@/lib/auth/guards";
import { getTenantWorkspace } from "@/lib/tenant-workspace";
import { writeAudit } from "@/lib/audit-log";

export async function GET(request: NextRequest) {
  const scope = await resolveTenantScope(request);
  if ("error" in scope) return scope.error;

  const workspace = getTenantWorkspace(scope.customerId);
  if (!workspace) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  if (scope.inspect) {
    writeAudit({
      action: "tenant.inspect",
      actorAccountId: scope.session.accountId,
      actorEmail: scope.session.email,
      actorRole: scope.session.role,
      customerId: scope.customerId,
      detail: "Partner opened isolated tenant workspace",
      meta: { path: "/api/me/workspace" },
    });
  } else {
    writeAudit({
      action: "tenant.workspace_read",
      actorAccountId: scope.session.accountId,
      actorEmail: scope.session.email,
      actorRole: scope.session.role,
      customerId: scope.customerId,
      detail: "Client loaded isolated workspace",
    });
  }

  return NextResponse.json({
    workspace,
    source: "tenant-isolated",
    inspect: scope.inspect,
  });
}
