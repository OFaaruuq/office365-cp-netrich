import { NextRequest, NextResponse } from "next/server";
import { requireClientTenant, requirePartnerAdmin, forbidden } from "@/lib/auth/guards";
import { findCustomer, publicTenantView } from "@/lib/customer-store";

/**
 * Client-safe tenant endpoint — never returns another tenant's data.
 */
export async function GET(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");

  const partner = await requirePartnerAdmin(request);
  if (!("error" in partner)) {
    if (!id) {
      return NextResponse.json(
        { error: "Use /api/admin/customers for the full tenant registry." },
        { status: 400 }
      );
    }
    const customer = findCustomer(id);
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ tenant: publicTenantView(customer) });
  }

  const client = await requireClientTenant(request, id);
  if ("error" in client) return client.error;

  const customer = findCustomer(client.customerId);
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (id && id !== client.customerId) {
    return forbidden(
      "Cross-tenant access denied. Each client tenant is strictly isolated.",
      "TENANT_ISOLATION"
    );
  }

  return NextResponse.json({ tenant: publicTenantView(customer) });
}
