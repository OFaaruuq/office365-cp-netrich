import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import path from "path";
import type { CostSummary, Subscription } from "@/lib/types";
import { getCatalogProduct } from "@/lib/catalog-store";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "tenant-subscriptions.json");

export type TenantSubscription = Subscription & {
  customerId: string;
  productId: string;
  catalog: string;
  unitPriceMonthly: number;
  purchasedAt: string;
  purchasedBy: string;
};

type Store = Record<string, TenantSubscription[]>;

function atomicWrite(filePath: string, contents: string) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, filePath);
}

function loadStore(): Store {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(FILE)) {
      atomicWrite(FILE, "{}");
      return {};
    }
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveStore(store: Store) {
  atomicWrite(FILE, JSON.stringify(store, null, 2));
}

export function listTenantSubscriptions(customerId: string): TenantSubscription[] {
  const store = loadStore();
  return store[customerId] || [];
}

/** Remove all commerce subscriptions for a deleted tenant */
export function deleteTenantSubscriptions(customerId: string): number {
  const store = loadStore();
  const count = store[customerId]?.length || 0;
  if (customerId in store) {
    delete store[customerId];
    saveStore(store);
  }
  return count;
}

/** Seed once when a tenant has no persisted purchases yet */
export function seedTenantSubscriptionsIfEmpty(
  customerId: string,
  seed: TenantSubscription[]
): TenantSubscription[] {
  const store = loadStore();
  if (store[customerId]) return store[customerId];
  store[customerId] = seed;
  saveStore(store);
  return seed;
}

export function getTenantCostSummary(customerId: string): CostSummary {
  const subs = listTenantSubscriptions(customerId);
  const monthly = Number(subs.reduce((n, s) => n + s.price, 0).toFixed(2));
  return { monthly, yearly: 0, triennially: 0 };
}

export function subscribeProduct(input: {
  customerId: string;
  productId: string;
  quantity: number;
  billingCycle: "Monthly" | "Annual" | "Triennial";
  actorEmail: string;
}): { subscription: TenantSubscription } | { error: string; code: string } {
  const product = getCatalogProduct(input.productId);
  if (!product || product.active === false) {
    return { error: "Product not found or not available.", code: "PRODUCT_UNAVAILABLE" };
  }
  if (input.quantity < 1 || input.quantity > 10000) {
    return { error: "Quantity must be between 1 and 10000.", code: "INVALID_QTY" };
  }

  const unit =
    input.billingCycle === "Annual" && product.priceYearly != null
      ? Number((product.priceYearly / 12).toFixed(2))
      : product.priceMonthly;

  const store = loadStore();
  const list = store[input.customerId] ? [...store[input.customerId]] : [];
  const existingIdx = list.findIndex((s) => s.productId === product.id);
  const now = new Date().toISOString();
  const renewal = new Date();
  if (input.billingCycle === "Annual") renewal.setFullYear(renewal.getFullYear() + 1);
  else if (input.billingCycle === "Triennial") renewal.setFullYear(renewal.getFullYear() + 3);
  else renewal.setMonth(renewal.getMonth() + 1);

  if (existingIdx >= 0) {
    const cur = list[existingIdx];
    const purchased = cur.purchased + input.quantity;
    list[existingIdx] = {
      ...cur,
      purchased,
      used: Math.min(cur.used, purchased),
      available: Math.max(0, purchased - cur.used),
      price: Number((unit * purchased).toFixed(2)),
      unitPriceMonthly: unit,
      billingCycle: input.billingCycle,
      commitment: input.billingCycle === "Monthly" ? "Monthly" : "Annual",
      nextRenewal: renewal.toISOString().slice(0, 10),
      purchasedAt: now,
      purchasedBy: input.actorEmail,
    };
    store[input.customerId] = list;
    saveStore(store);
    return { subscription: list[existingIdx] };
  }

  const sub: TenantSubscription = {
    id: `sub-${input.customerId}-${product.id}`,
    customerId: input.customerId,
    productId: product.id,
    catalog: product.catalog,
    name: product.name,
    description: product.description,
    category: "business",
    purchased: input.quantity,
    used: 0,
    available: input.quantity,
    billingCycle: input.billingCycle,
    commitment: input.billingCycle === "Monthly" ? "Monthly" : "Annual",
    price: Number((unit * input.quantity).toFixed(2)),
    unitPriceMonthly: unit,
    nextRenewal: renewal.toISOString().slice(0, 10),
    skuId: product.id,
    purchasedAt: now,
    purchasedBy: input.actorEmail,
  };
  list.unshift(sub);
  store[input.customerId] = list;
  saveStore(store);
  return { subscription: sub };
}

export function changeSubscriptionSeats(input: {
  customerId: string;
  subscriptionId: string;
  quantity: number;
  actorEmail: string;
}): { subscription: TenantSubscription } | { error: string; code: string } {
  const store = loadStore();
  const list = store[input.customerId] || [];
  const idx = list.findIndex((s) => s.id === input.subscriptionId);
  if (idx < 0) return { error: "Subscription not found", code: "NOT_FOUND" };
  if (input.quantity < 0 || input.quantity > 10000) {
    return { error: "Invalid quantity", code: "INVALID_QTY" };
  }
  const cur = list[idx];
  if (input.quantity === 0) {
    list.splice(idx, 1);
    store[input.customerId] = list;
    saveStore(store);
    return { subscription: { ...cur, purchased: 0, available: 0, used: 0, price: 0 } };
  }
  const unit = cur.unitPriceMonthly || (cur.purchased ? cur.price / cur.purchased : 0);
  list[idx] = {
    ...cur,
    purchased: input.quantity,
    used: Math.min(cur.used, input.quantity),
    available: Math.max(0, input.quantity - Math.min(cur.used, input.quantity)),
    price: Number((unit * input.quantity).toFixed(2)),
    purchasedBy: input.actorEmail,
    purchasedAt: new Date().toISOString(),
  };
  store[input.customerId] = list;
  saveStore(store);
  return { subscription: list[idx] };
}
