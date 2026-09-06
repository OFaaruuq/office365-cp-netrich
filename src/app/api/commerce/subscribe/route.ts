import { NextRequest, NextResponse } from "next/server";
import { requireClientTenant, resolveTenantScope } from "@/lib/auth/guards";
import { findCustomer } from "@/lib/customer-store";
import { getCatalogProduct } from "@/lib/catalog-store";
import {
  changeSubscriptionSeats,
  listTenantSubscriptions,
  subscribeProduct,
} from "@/lib/subscription-store";
import { writeAudit } from "@/lib/audit-log";

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
 * Client tenant purchase / subscribe.
 * Body: { productId, quantity, billingCycle }
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
  const billingCycle = (body.billingCycle || "Monthly") as
    | "Monthly"
    | "Annual"
    | "Triennial";

  const idemKey =
    request.headers.get("idempotency-key") ||
    (typeof body.idempotencyKey === "string" ? body.idempotencyKey : "");
  if (idemKey) {
    const { idempotencyGet, idempotencyPut } = await import("@/lib/platform-store");
    const existing = idempotencyGet(idemKey, "commerce.subscribe");
    if (existing) {
      return NextResponse.json(existing.responseBody, { status: existing.responseCode });
    }
  }

  const product = getCatalogProduct(productId);
  if (!product || !product.active) {
    return NextResponse.json(
      { error: "Product not available.", code: "PRODUCT_UNAVAILABLE" },
      { status: 404 }
    );
  }

  const allowed = customer.config.allowedCatalogs || [];
  if (!allowed.includes(product.catalog)) {
    return NextResponse.json(
      {
        error: "This catalog is not enabled for your tenant. Contact Super Admin.",
        code: "CATALOG_DENIED",
      },
      { status: 403 }
    );
  }

  const result = subscribeProduct({
    customerId: client.customerId,
    productId,
    quantity,
    billingCycle,
    actorEmail: client.session.email,
  });

  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }

  writeAudit({
    action: "commerce.subscribe",
    actorAccountId: client.session.accountId,
    actorEmail: client.session.email,
    actorRole: client.session.role,
    customerId: client.customerId,
    detail: `Subscribed ${quantity} × ${product.name} (${billingCycle})`,
    meta: {
      productId,
      quantity,
      billingCycle,
      subscriptionId: result.subscription.id,
    },
    riskLevel: "medium",
    requestId: idemKey || undefined,
  });

  const payload = {
    ok: true,
    subscription: result.subscription,
    message: `Subscribed ${quantity} seat(s) of ${product.name}.`,
  };

  if (idemKey) {
    const { idempotencyPut } = await import("@/lib/platform-store");
    const put = idempotencyPut({
      key: idemKey,
      customerId: client.customerId,
      operation: "commerce.subscribe",
      body: { productId, quantity, billingCycle },
      responseCode: 200,
      responseBody: payload,
    });
    if ("conflict" in put && put.conflict) {
      return NextResponse.json(
        { error: "Idempotency-Key reused with different payload", code: "IDEMPOTENCY_CONFLICT" },
        { status: 409 }
      );
    }
  }

  return NextResponse.json(payload);
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
