import { NextRequest, NextResponse } from "next/server";
import {
  denyActiveInspectWrite,
  requireClientTenant,
  requirePartnerAdmin,
  requireSession,
} from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit-log";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseRequest,
  listPurchaseOrders,
  payPurchaseOrder,
  rejectPurchaseOrder,
} from "@/lib/purchase-store";
import { loadPlatform, savePlatform } from "@/lib/platform-store";
import { activeInspect, SESSION_COOKIE, LEGACY_SESSION_COOKIE } from "@/lib/auth/server-session";
import { cspApiBase, cspInternalHeaders } from "@/lib/csp-api";

/** List purchase orders — client sees own; partner sees all */
export async function GET(request: NextRequest) {
  const auth = await requireSession(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  if (auth.session.role === "partner_admin") {
    const inspect = activeInspect(auth.session);
    const customerId =
      url.searchParams.get("customerId") || inspect?.customerId || undefined;
    const status = url.searchParams.get("status") || undefined;
    return NextResponse.json({
      orders: listPurchaseOrders({
        customerId,
        status: status as never,
      }),
      source: "local",
    });
  }

  if (auth.session.role === "customer_admin" && auth.session.customerId) {
    return NextResponse.json({
      orders: listPurchaseOrders({ customerId: auth.session.customerId }),
      customerId: auth.session.customerId,
      source: "local",
    });
  }

  return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
}

/**
 * Client: create purchase request (all catalogs).
 * Licenses only after partner approval + full payment.
 */
export async function POST(request: NextRequest) {
  const client = await requireClientTenant(request);
  if ("error" in client) return client.error;

  const body = await request.json().catch(() => ({}));
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
    customerId: result.order.customerId,
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
    detail: `Purchase requested: ${quantity} × ${result.order.productName} (awaiting approval & payment)`,
    meta: {
      purchaseOrderId: result.order.id,
      productId,
      quantity,
      billingCycle,
      total: result.order.total,
    },
    riskLevel: "medium",
  });

  try {
    const token =
      request.cookies.get(SESSION_COOKIE)?.value || request.cookies.get(LEGACY_SESSION_COOKIE)?.value;
    await fetch(`${cspApiBase()}/v1/orders`, {
      method: "POST",
      headers: cspInternalHeaders(client.session, client.customerId, token),
      body: JSON.stringify({
        id: result.order.id,
        customerId: result.order.customerId,
        status: result.order.status,
        totalAmount: result.order.total,
        currency: result.order.currency,
        items: [
          {
            skuId: result.order.productId,
            name: result.order.productName,
            quantity: result.order.quantity,
            unitPrice: result.order.unitPrice,
          },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* local SoR remains */
  }

  return NextResponse.json({
    ok: true,
    order: result.order,
    message: `Order submitted for ${result.order.productName}. Licenses are issued after Super Admin approval and full payment.`,
  });
}

/** Partner approve/reject OR client pay/cancel */
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || body.orderId || "");
  const action = String(body.action || "");

  if (!id || !action) {
    return NextResponse.json({ error: "id and action required" }, { status: 400 });
  }

  if (action === "approve" || action === "reject") {
    const partner = await requirePartnerAdmin(request);
    if ("error" in partner) return partner.error;
    const inspectBlocked = denyActiveInspectWrite(partner.session);
    if (inspectBlocked) return inspectBlocked;

    const result =
      action === "approve"
        ? approvePurchaseOrder(id, partner.session.email)
        : rejectPurchaseOrder(id, partner.session.email, body.reason ? String(body.reason) : undefined);

    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }

    const platform = loadPlatform();
    const apr = platform.approvals.find(
      (a) => a.payload?.purchaseOrderId === id || a.id === `apr-${id}`
    );
    if (apr) {
      apr.status = action === "approve" ? "approved" : "rejected";
      apr.decidedAt = new Date().toISOString();
      apr.approverEmail = partner.session.email;
    }
    platform.notifications.unshift({
      id: `ntf-po-dec-${id}`,
      customerId: result.order.customerId,
      type: action === "approve" ? "commerce.purchase_approved" : "commerce.purchase_rejected",
      severity: action === "approve" ? "info" : "warning",
      title: action === "approve" ? "Purchase approved — payment required" : "Purchase rejected",
      message:
        action === "approve"
          ? `Payment of $${result.order.total.toFixed(2)} for ${result.order.productName} must be recorded by netrichtechnologies before licenses are issued.`
          : result.order.rejectReason || "Your purchase request was rejected.",
      actionUrl: "/workspace/orders",
      createdAt: new Date().toISOString(),
    });
    savePlatform(platform);

    writeAudit({
      action: "commerce.subscribe",
      actorAccountId: partner.session.accountId,
      actorEmail: partner.session.email,
      actorRole: partner.session.role,
      customerId: result.order.customerId,
      detail: `Purchase ${action}: ${result.order.id} (${result.order.productName})`,
      meta: { purchaseOrderId: id, status: result.order.status },
      riskLevel: "high",
      approvalId: apr?.id,
    });

    return NextResponse.json({
      ok: true,
      order: result.order,
      message:
        action === "approve"
          ? "Approved. Super Admin records payment with a reference before licenses are issued."
          : "Purchase request rejected.",
    });
  }

  if (action === "pay") {
    const partner = await requirePartnerAdmin(request);
    if ("error" in partner) return partner.error;

    const paymentRef = String(body.paymentRef || "").trim();
    if (!paymentRef) {
      return NextResponse.json(
        { error: "paymentRef is required (bank transfer, invoice, or receipt ID).", code: "PAYMENT_REF_REQUIRED" },
        { status: 400 }
      );
    }

    const result = payPurchaseOrder(id, partner.session.email, paymentRef);
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }

    writeAudit({
      action: "commerce.subscribe",
      actorAccountId: partner.session.accountId,
      actorEmail: partner.session.email,
      actorRole: partner.session.role,
      customerId: result.order.customerId,
      detail: `Recorded payment & fulfilled ${result.order.quantity} × ${result.order.productName}`,
      meta: {
        purchaseOrderId: result.order.id,
        paymentRef: result.order.paymentRef || "",
        subscriptionId: result.order.subscriptionId || "",
        total: result.order.total,
      },
      riskLevel: "high",
    });

    return NextResponse.json({
      ok: true,
      order: result.order,
      message: `Payment recorded. ${result.order.quantity} license(s) for ${result.order.productName} are now active.`,
    });
  }

  if (action === "cancel") {
    const client = await requireClientTenant(request);
    if ("error" in client) return client.error;
    const result = cancelPurchaseOrder(id, client.customerId);
    if ("error" in result) return NextResponse.json(result, { status: 400 });
    return NextResponse.json({ ok: true, order: result.order, message: "Order cancelled." });
  }

  return NextResponse.json({ error: "Unknown action", code: "BAD_ACTION" }, { status: 400 });
}
