import { NextRequest, NextResponse } from "next/server";
import { resolveTenantScope } from "@/lib/auth/guards";
import { getTenantWorkspace } from "@/lib/tenant-workspace";

/**
 * Subscriptions are always served from the isolated tenant workspace.
 * Live Graph SKU pulls are partner-only and never mixed into another tenant's store
 * without an explicit future GDAP binding (disabled in demo for isolation safety).
 */
export async function GET(request: NextRequest) {
  const scope = await resolveTenantScope(request);
  if ("error" in scope) return scope.error;

  const tokenHeader = request.headers.get("authorization");
  const token = tokenHeader?.startsWith("Bearer ") ? tokenHeader.slice(7) : null;

  if (token) {
    return NextResponse.json(
      {
        error:
          "Direct Graph SKU import is disabled in the control panel demo to prevent cross-tenant data mixing. Use the isolated tenant workspace.",
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

  return NextResponse.json({
    subscriptions: workspace.subscriptions,
    source: "tenant-isolated",
    customerId: workspace.customerId,
    inspect: scope.inspect,
  });
}
