import { NextRequest, NextResponse } from "next/server";
import { resolveTenantScope } from "@/lib/auth/guards";
import {
  ALL_PRODUCT_CATALOGS,
  getAllowedCatalogProducts,
  getTenantWorkspace,
} from "@/lib/tenant-workspace";
import { writeAudit } from "@/lib/audit-log";

export async function GET(request: NextRequest) {
  const scope = await resolveTenantScope(request);
  if ("error" in scope) return scope.error;

  const workspace = getTenantWorkspace(scope.customerId);
  if (!workspace) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const catalog = new URL(request.url).searchParams.get("catalog");

  if (scope.inspect) {
    writeAudit({
      action: "tenant.inspect",
      actorAccountId: scope.session.accountId,
      actorEmail: scope.session.email,
      actorRole: scope.session.role,
      customerId: scope.customerId,
      detail: `Partner inspected products${catalog ? ` (${catalog})` : ""}`,
      meta: { path: "/api/products", catalog: catalog || "index" },
    });
  }

  if (catalog === "purchased") {
    return NextResponse.json({
      subscriptions: workspace.subscriptions,
      costSummary: workspace.costSummary,
      customerId: workspace.customerId,
      source: "tenant-isolated",
      inspect: scope.inspect,
    });
  }

  if (
    catalog === "microsoft-365" ||
    catalog === "dynamics-365" ||
    catalog === "azure" ||
    catalog === "server-software"
  ) {
    const products = getAllowedCatalogProducts(scope.customerId, catalog);
    if ("error" in products) {
      return NextResponse.json(products, { status: 403 });
    }
    return NextResponse.json({
      products,
      customerId: workspace.customerId,
      allowedCatalogs: [...ALL_PRODUCT_CATALOGS],
      source: "tenant-isolated",
      inspect: scope.inspect,
    });
  }

  return NextResponse.json({
    customerId: workspace.customerId,
    allowedCatalogs: [...ALL_PRODUCT_CATALOGS],
    catalogs: Object.fromEntries(
      ALL_PRODUCT_CATALOGS.map((id) => {
        const result = getAllowedCatalogProducts(scope.customerId, id);
        return [id, Array.isArray(result) ? result.length : 0];
      })
    ),
    purchased: workspace.subscriptions.length,
    source: "tenant-isolated",
    inspect: scope.inspect,
  });
}
