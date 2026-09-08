import { NextRequest, NextResponse } from "next/server";
import { requireClientTenant, resolveTenantScope } from "@/lib/auth/guards";
import { findCustomer } from "@/lib/customer-store";
import { changeSubscriptionSeats, listTenantSubscriptions } from "@/lib/subscription-store";
import { writeAudit } from "@/lib/audit-log";
import { createPurchaseRequest } from "@/lib/purchase-store";
import { loadPlatform, savePlatform } from "@/lib/platform-store";

/** List this tenant's subscriptions (isolated) */
export async function GET(request: NextRequest) {
  const scope = await resolveTenantScope(request);
  if ("error" in scope) return scope.error;

  const subscriptions = listTenantSubscriptions(scope.customerId);
  return NextResponse.json({
    subscriptions,
    customerId: scope.customerId,
    source: "tenant-isolated",
  });
}

/**
 * Client purchase request (compat path).
 * Immediate subscribe is disabled — licenses only after partner approval + full payment.
 * Prefer POST /api/commerce/orders.
 */
export async function POST(request: NextRequest) {
  const client = await requireClientTenant(request);
  if ("error" in client) return client.error;

  const customer = findCustomer(client.customerId);
  if (!customer || customer.status !== "active" || !customer.config?.portalAccessEnabled) {
    return NextResponse.json(
      { error: "Portal access locked for this tenant.", code: "PORTAL_LOCKED" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const productId = String(body.productId || "");
  const quantity = Number(body.quantity || 0);
  const billingCycle = (body.billingCycle || "Monthly") as "Monthly" | "Annual" | "Triennial";

  const result = createPurchaseRequest({
    customerId: client.customerId,
    productId,
    quantity,
    billingCycle,
    actorEmail: client.session.email,
  });

  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }

  const platform = loadPlatform();
  platform.notifications.unshift({
    id: `ntf-po-${result.order.id}`,
    type: "commerce.purchase_request",
    severity: "info",
    title: "New purchase request",
    message: `${result.order.customerName} requested ${result.order.quantity} × ${result.order.productName}`,
    actionUrl: "/admin/commerce/orders",
    createdAt: new Date().toISOString(),
  });
  platform.approvals.unshift({
    id: `apr-${result.order.id}`,
    operation: "commerce.purchase_approve",
    customerId: result.order.customerId,
    requesterEmail: client.session.email,
    status: "pending",
    payload: { purchaseOrderId: result.order.id },
    createdAt: new Date().toISOString(),
  });
  savePlatform(platform);

  writeAudit({
    action: "commerce.subscribe",
    actorAccountId: client.session.accountId,
    actorEmail: client.session.email,
    actorRole: client.session.role,
    customerId: client.customerId,
    detail: `Purchase requested via subscribe compat: ${quantity} × ${result.order.productName}`,
    meta: {
      purchaseOrderId: result.order.id,
      productId,
      quantity,
      billingCycle,
      total: result.order.total,
    },
    riskLevel: "medium",
  });

  return NextResponse.json({
    ok: true,
    order: result.order,
    message: `Order submitted for ${result.order.productName}. Licenses are issued after Super Admin approval and full payment.`,
    code: "AWAITING_APPROVAL",
  });
}

/** Change seats on an existing subscription */
export async function PATCH(request: NextRequest) {
  const client = await requireClientTenant(request);
  if ("error" in client) return client.error;

  const body = await request.json();
  const result = changeSubscriptionSeats({
    customerId: client.customerId,
    subscriptionId: String(body.subscriptionId || ""),
    quantity: Number(body.quantity),
    actorEmail: client.session.email,
  });

  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json({ ok: true, subscription: result.subscription });
}
