/**
 * Client purchase requests: Order → Partner approval → Full payment → License fulfillment.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { getCatalogProduct } from "@/lib/catalog-store";
import { subscribeProduct } from "@/lib/subscription-store";
import { findCustomer } from "@/lib/customer-store";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "purchase-orders.json");

export type PurchaseStatus =
  | "REQUESTED"
  | "APPROVED"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "FULFILLED"
  | "REJECTED"
  | "CANCELLED";

export type PurchaseOrder = {
  id: string;
  customerId: string;
  customerName: string;
  productId: string;
  productName: string;
  catalog: string;
  quantity: number;
  billingCycle: "Monthly" | "Annual" | "Triennial";
  unitPrice: number;
  total: number;
  currency: string;
  status: PurchaseStatus;
  requestedBy: string;
  requestedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectReason?: string;
  paidAt?: string;
  paidBy?: string;
  paymentRef?: string;
  fulfilledAt?: string;
  subscriptionId?: string;
  updatedAt: string;
};

type FileShape = { orders: PurchaseOrder[] };

function atomicWrite(filePath: string, contents: string) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, filePath);
}

function load(): FileShape {
  try {
    if (!existsSync(FILE)) return { orders: [] };
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as FileShape;
    return { orders: Array.isArray(parsed.orders) ? parsed.orders : [] };
  } catch {
    return { orders: [] };
  }
}

function save(data: FileShape) {
  atomicWrite(FILE, JSON.stringify(data, null, 2));
}

export function listPurchaseOrders(filter?: {
  customerId?: string;
  status?: PurchaseStatus | PurchaseStatus[];
}): PurchaseOrder[] {
  let rows = load().orders;
  if (filter?.customerId) rows = rows.filter((o) => o.customerId === filter.customerId);
  if (filter?.status) {
    const set = new Set(Array.isArray(filter.status) ? filter.status : [filter.status]);
    rows = rows.filter((o) => set.has(o.status));
  }
  return rows.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export function getPurchaseOrder(id: string): PurchaseOrder | undefined {
  return load().orders.find((o) => o.id === id);
}

export function createPurchaseRequest(input: {
  customerId: string;
  productId: string;
  quantity: number;
  billingCycle: "Monthly" | "Annual" | "Triennial";
  actorEmail: string;
}): { order: PurchaseOrder } | { error: string; code: string } {
  const customer = findCustomer(input.customerId);
  if (!customer) return { error: "Tenant not found", code: "TENANT_NOT_FOUND" };
  if (customer.status !== "active" || !customer.config?.portalAccessEnabled) {
    return { error: "Portal access locked for this tenant.", code: "PORTAL_LOCKED" };
  }

  const product = getCatalogProduct(input.productId);
  if (!product || product.active === false) {
    return { error: "Product not available.", code: "PRODUCT_UNAVAILABLE" };
  }
  if (input.quantity < 1 || input.quantity > 10000) {
    return { error: "Quantity must be between 1 and 10000.", code: "INVALID_QTY" };
  }

  const unit =
    input.billingCycle === "Annual" && product.priceYearly != null
      ? Number((product.priceYearly / 12).toFixed(2))
      : product.priceMonthly;
  const total = Number((unit * input.quantity).toFixed(2));
  const now = new Date().toISOString();

  const order: PurchaseOrder = {
    id: `po-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`,
    customerId: customer.id,
    customerName: customer.name,
    productId: product.id,
    productName: product.name,
    catalog: product.catalog,
    quantity: input.quantity,
    billingCycle: input.billingCycle,
    unitPrice: unit,
    total,
    currency: "USD",
    status: "REQUESTED",
    requestedBy: input.actorEmail,
    requestedAt: now,
    updatedAt: now,
  };

  const data = load();
  data.orders.unshift(order);
  save(data);
  return { order };
}

export function approvePurchaseOrder(
  id: string,
  actorEmail: string
): { order: PurchaseOrder } | { error: string; code: string } {
  const data = load();
  const order = data.orders.find((o) => o.id === id);
  if (!order) return { error: "Order not found", code: "NOT_FOUND" };
  if (order.status !== "REQUESTED") {
    return { error: `Cannot approve order in status ${order.status}`, code: "INVALID_STATE" };
  }
  const now = new Date().toISOString();
  order.status = "AWAITING_PAYMENT";
  order.approvedBy = actorEmail;
  order.approvedAt = now;
  order.updatedAt = now;
  save(data);
  return { order };
}

export function rejectPurchaseOrder(
  id: string,
  actorEmail: string,
  reason?: string
): { order: PurchaseOrder } | { error: string; code: string } {
  const data = load();
  const order = data.orders.find((o) => o.id === id);
  if (!order) return { error: "Order not found", code: "NOT_FOUND" };
  if (order.status !== "REQUESTED" && order.status !== "AWAITING_PAYMENT") {
    return { error: `Cannot reject order in status ${order.status}`, code: "INVALID_STATE" };
  }
  const now = new Date().toISOString();
  order.status = "REJECTED";
  order.rejectedBy = actorEmail;
  order.rejectedAt = now;
  order.rejectReason = reason || "Rejected by partner";
  order.updatedAt = now;
  save(data);
  return { order };
}

export function payPurchaseOrder(
  id: string,
  actorEmail: string,
  paymentRef?: string
): { order: PurchaseOrder } | { error: string; code: string } {
  const data = load();
  const order = data.orders.find((o) => o.id === id);
  if (!order) return { error: "Order not found", code: "NOT_FOUND" };
  if (order.status !== "AWAITING_PAYMENT" && order.status !== "APPROVED") {
    return {
      error: "Order must be approved before payment. Wait for Super Admin approval.",
      code: "PAYMENT_NOT_ALLOWED",
    };
  }

  const now = new Date().toISOString();
  order.status = "PAID";
  order.paidAt = now;
  order.paidBy = actorEmail;
  order.paymentRef = paymentRef || `PAY-${Date.now().toString(36).toUpperCase()}`;
  order.updatedAt = now;
  save(data);

  return fulfillPurchaseOrder(id);
}

export function fulfillPurchaseOrder(
  id: string
): { order: PurchaseOrder } | { error: string; code: string } {
  const data = load();
  const order = data.orders.find((o) => o.id === id);
  if (!order) return { error: "Order not found", code: "NOT_FOUND" };
  if (order.status !== "PAID" && order.status !== "FULFILLED") {
    return { error: "Order must be paid before license fulfillment", code: "INVALID_STATE" };
  }
  if (order.status === "FULFILLED" && order.subscriptionId) {
    return { order };
  }

  const result = subscribeProduct({
    customerId: order.customerId,
    productId: order.productId,
    quantity: order.quantity,
    billingCycle: order.billingCycle,
    actorEmail: order.paidBy || order.requestedBy,
  });
  if ("error" in result) {
    return { error: result.error, code: result.code };
  }

  const now = new Date().toISOString();
  order.status = "FULFILLED";
  order.fulfilledAt = now;
  order.subscriptionId = result.subscription.id;
  order.updatedAt = now;
  save(data);
  return { order };
}

export function cancelPurchaseOrder(
  id: string,
  customerId: string
): { order: PurchaseOrder } | { error: string; code: string } {
  const data = load();
  const order = data.orders.find((o) => o.id === id);
  if (!order || order.customerId !== customerId) {
    return { error: "Order not found", code: "NOT_FOUND" };
  }
  if (order.status !== "REQUESTED") {
    return { error: "Only requested orders can be cancelled", code: "INVALID_STATE" };
  }
  order.status = "CANCELLED";
  order.updatedAt = new Date().toISOString();
  save(data);
  return { order };
}
