/**
 * Foundation platform store — completes Phase-1 PARTIAL modules with durable local SoR
 * (works without Docker; Nest/Postgres remains preferred when up).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import path from "path";
import { createHash, randomBytes } from "crypto";
import { findCustomer, loadCustomers } from "@/lib/customer-store";
import { listTenantSubscriptions } from "@/lib/subscription-store";
import { DEMO_CUSTOMER_IDS } from "@/lib/tenancy-data";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "platform.json");

export type ContactType =
  | "PRIMARY"
  | "TECHNICAL"
  | "BILLING"
  | "SECURITY"
  | "LEGAL"
  | "PROCUREMENT";

export type PlatformFile = {
  contacts: Array<{
    id: string;
    customerId: string;
    type: ContactType;
    name: string;
    email: string;
    phone?: string;
  }>;
  domains: Array<{
    id: string;
    customerId: string;
    name: string;
    verified: boolean;
    primary: boolean;
    dns: { mx: boolean; spf: boolean; dkim: boolean; dmarc: boolean; autodiscover: boolean };
  }>;
  priceLists: Array<{
    id: string;
    name: string;
    currency: string;
    items: Array<{
      productId: string;
      listPrice: number;
      partnerCost: number;
      netrichPrice: number;
      customerDiscount: number;
    }>;
  }>;
  customerPriceRules: Array<{
    id: string;
    customerId: string;
    productId?: string;
    catalogId?: string;
    discountPct: number;
    minMargin: number;
    currency: string;
  }>;
  quotes: Array<{
    id: string;
    customerId: string;
    status: "draft" | "sent" | "approved" | "rejected" | "ordered";
    currency: string;
    items: Array<{ productId: string; name: string; qty: number; unitPrice: number }>;
    notes?: string;
    validUntil?: string;
    createdBy?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  invoices: Array<{
    id: string;
    customerId: string;
    customerName: string;
    quoteId?: string;
    orderId?: string;
    period: string;
    currency: string;
    items: Array<{ productId?: string; name: string; qty: number; unitPrice: number }>;
    microsoftCost: number;
    netrichMarkup: number;
    taxRate: number;
    tax: number;
    subtotal: number;
    total: number;
    status: "draft" | "sent" | "open" | "paid" | "void";
    notes?: string;
    dueAt?: string;
    paidAt?: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  }>;
  orders: Array<{
    id: string;
    customerId: string;
    quoteId?: string;
    status:
      | "DRAFT"
      | "VALIDATING"
      | "AWAITING_APPROVAL"
      | "SUBMITTING"
      | "MICROSOFT_ACCEPTED"
      | "PROVISIONING"
      | "FULFILLED"
      | "FAILED"
      | "PARTIAL"
      | "REQUIRES_ACTION";
    items: Array<{ name: string; qty: number; unitPrice: number }>;
    createdAt: string;
    updatedAt: string;
  }>;
  jobs: Array<{
    id: string;
    name: string;
    queue: string;
    customerId?: string;
    status: "queued" | "running" | "succeeded" | "failed" | "dead_letter";
    attempts: number;
    lastError?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  notifications: Array<{
    id: string;
    customerId?: string;
    userId?: string;
    type: string;
    severity: string;
    title: string;
    message: string;
    actionUrl?: string;
    readAt?: string;
    createdAt: string;
  }>;
  notificationPrefs: Array<{
    userId: string;
    renewals: string[];
    security: string[];
    invoices: string[];
    support: string[];
    incidents: string[];
  }>;
  sessions: Array<{
    id: string;
    userId: string;
    email: string;
    ip: string;
    userAgent: string;
    createdAt: string;
    lastSeen: string;
    expiresAt: string;
    revokedAt?: string;
    current?: boolean;
  }>;
  serviceHealth: Record<
    string,
    Array<{ service: string; status: "Healthy" | "Advisory" | "Incident"; detail?: string }>
  >;
  security: Record<
    string,
    {
      secureScore: number;
      mfaCoverage: number;
      privilegedUsers: number;
      riskyUsers: number;
      disabledUsers: number;
      staleAccounts: number;
      guestAccounts: number;
      legacyAuth: number;
      adminMfa: number;
      source?: string;
      recommendations: Array<{ severity: string; text: string }>;
    }
  >;
  approvals: Array<{
    id: string;
    operation: string;
    customerId?: string;
    requesterEmail: string;
    status: "pending" | "approved" | "rejected" | "executed";
    payload?: Record<string, unknown>;
    createdAt: string;
    decidedAt?: string;
    executedAt?: string;
    executedBy?: string;
    approverEmail?: string;
  }>;
  idempotency: Array<{
    key: string;
    customerId: string;
    operation: string;
    requestHash: string;
    status: string;
    responseCode: number;
    responseBody: unknown;
    createdAt: string;
    expiresAt: string;
  }>;
  graphSync: Array<{
    customerId: string;
    resource: string;
    deltaLink?: string;
    lastFullSync?: string;
    lastDeltaSync?: string;
    status: string;
  }>;
  breakGlassEmails: string[];
  breakGlassSessions: Array<{
    id: string;
    email: string;
    reason: string;
    actorEmail: string;
    startedAt: string;
    expiresAt: string;
    endedAt?: string;
  }>;
};

function atomicWrite(filePath: string, contents: string) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, filePath);
}

function empty(): PlatformFile {
  return {
    contacts: [],
    domains: [],
    priceLists: [],
    customerPriceRules: [],
    quotes: [],
    invoices: [],
    orders: [],
    jobs: [],
    notifications: [],
    notificationPrefs: [],
    sessions: [],
    serviceHealth: {},
    security: {},
    approvals: [],
    idempotency: [],
    graphSync: [],
    breakGlassEmails: ["breakglass@netrichtechnologies.com"],
    breakGlassSessions: [],
  };
}

function ensureSeed(data: PlatformFile): PlatformFile {
  const base = { ...empty(), ...data };
  const customers = loadCustomers();

  if (!base.priceLists.length) {
    base.priceLists = [
      {
        id: "pl-default-usd",
        name: "Netrich Default USD",
        currency: "USD",
        items: [
          {
            productId: "m365-business-basic",
            listPrice: 6,
            partnerCost: 4.8,
            netrichPrice: 5.5,
            customerDiscount: 0.25,
          },
          {
            productId: "m365-business-standard",
            listPrice: 12.5,
            partnerCost: 9.8,
            netrichPrice: 11.5,
            customerDiscount: 0.5,
          },
          {
            productId: "m365-business-premium",
            listPrice: 22,
            partnerCost: 17.5,
            netrichPrice: 20,
            customerDiscount: 0.75,
          },
        ],
      },
    ];
  }

  const fakeJobIds = new Set(["job-catalog-1", "job-gdap-1", "job-fail-1"]);
  base.jobs = (base.jobs || []).filter(
    (j) => !fakeJobIds.has(j.id) && !String(j.lastError || "").includes("Simulated throttle")
  );

  const dropDemo = (customerId?: string) => !customerId || !DEMO_CUSTOMER_IDS.has(customerId);
  base.quotes = (base.quotes || []).filter((q) => dropDemo(q.customerId) && !String(q.id).startsWith("qt-demo"));
  base.invoices = (base.invoices || []).filter(
    (i) => dropDemo(i.customerId) && !String(i.id).startsWith("inv-demo")
  );
  base.orders = (base.orders || []).filter((o) => dropDemo(o.customerId) && !String(o.id).startsWith("ord-demo"));
  base.contacts = (base.contacts || []).filter((c) => dropDemo(c.customerId));
  base.domains = (base.domains || []).filter((d) => dropDemo(d.customerId));
  base.notifications = (base.notifications || []).filter(
    (n) => dropDemo(n.customerId) && !String(n.id).match(/^ntf-cust-.*-gdap$/)
  );

  for (const c of customers) {
    if (!base.serviceHealth[c.id]) {
      base.serviceHealth[c.id] = [];
    }
    if (!base.security[c.id] || !base.security[c.id].source || base.security[c.id].source === "local-formula") {
      base.security[c.id] = {
        secureScore: 0,
        mfaCoverage: 0,
        privilegedUsers: 0,
        riskyUsers: 0,
        disabledUsers: 0,
        staleAccounts: 0,
        guestAccounts: 0,
        legacyAuth: 0,
        adminMfa: 0,
        source: "local-unmeasured",
        recommendations: [
          { severity: "INFO", text: "Connect Microsoft Graph to populate Secure Score for this tenant." },
        ],
      };
    }
    if (!base.graphSync.some((g) => g.customerId === c.id)) {
      base.graphSync.push(
        {
          customerId: c.id,
          resource: "users",
          status: "not_synced",
        },
        {
          customerId: c.id,
          resource: "subscribedSkus",
          status: "not_synced",
        }
      );
    }
  }

  if (!Array.isArray(base.breakGlassSessions)) base.breakGlassSessions = [];
  for (const g of base.graphSync) {
    if (g.deltaLink?.includes("deltatoken=stub-")) {
      delete g.deltaLink;
      g.status = "not_synced";
      g.lastFullSync = undefined;
      g.lastDeltaSync = undefined;
    }
  }

  return base;
}

export function loadPlatform(): PlatformFile {
  try {
    if (!existsSync(FILE)) {
      const seeded = ensureSeed(empty());
      atomicWrite(FILE, JSON.stringify(seeded, null, 2));
      return seeded;
    }
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as PlatformFile;
    const seeded = ensureSeed(parsed);
    const hadFixtures =
      (parsed.quotes || []).some((q) => String(q.id).startsWith("qt-demo")) ||
      (parsed.invoices || []).some((i) => String(i.id).startsWith("inv-demo")) ||
      (parsed.orders || []).some((o) => String(o.id).startsWith("ord-demo")) ||
      (parsed.jobs || []).some((j) =>
        ["job-catalog-1", "job-gdap-1", "job-fail-1"].includes(j.id)
      );
    if (hadFixtures) atomicWrite(FILE, JSON.stringify(seeded, null, 2));
    return seeded;
  } catch {
    return ensureSeed(empty());
  }
}

export type PlatformQuote = PlatformFile["quotes"][number];
export type PlatformInvoice = PlatformFile["invoices"][number];

export function savePlatform(data: PlatformFile) {
  atomicWrite(FILE, JSON.stringify(data, null, 2));
}

export function createPlatformQuote(input: {
  customerId: string;
  currency?: string;
  items: Array<{ productId?: string; name: string; qty: number; unitPrice: number }>;
  notes?: string;
  validUntil?: string;
  createdBy: string;
}): { quote: PlatformQuote } | { error: string; code: string } {
  const customer = findCustomer(input.customerId);
  if (!customer) return { error: "Customer required", code: "CUSTOMER_REQUIRED" };
  const items = (input.items || [])
    .map((raw) => ({
      productId: String(raw.productId || ""),
      name: String(raw.name || "").trim() || "Line item",
      qty: Math.max(1, Number(raw.qty) || 1),
      unitPrice: Math.max(0, Number(raw.unitPrice) || 0),
    }))
    .filter((i) => i.name);
  if (!items.length) return { error: "Add at least one line item", code: "ITEMS_REQUIRED" };

  const now = new Date().toISOString();
  const quote: PlatformQuote = {
    id: `qt-${Date.now().toString(36)}`,
    customerId: input.customerId,
    status: "draft",
    currency: input.currency || "USD",
    items,
    notes: input.notes || undefined,
    validUntil: input.validUntil || undefined,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  const platform = loadPlatform();
  platform.quotes.unshift(quote);
  savePlatform(platform);
  return { quote };
}

export function createPlatformInvoice(input: {
  customerId: string;
  currency?: string;
  period?: string;
  items: Array<{ productId?: string; name: string; qty: number; unitPrice: number }>;
  microsoftCost?: number;
  netrichMarkup?: number;
  taxRate?: number;
  tax?: number;
  quoteId?: string;
  orderId?: string;
  notes?: string;
  dueAt?: string;
  status?: PlatformInvoice["status"];
  createdBy: string;
}): { invoice: PlatformInvoice } | { error: string; code: string } {
  const customer = findCustomer(input.customerId);
  if (!customer) return { error: "Customer required", code: "CUSTOMER_REQUIRED" };
  const items = (input.items || [])
    .map((raw) => ({
      productId: raw.productId ? String(raw.productId) : undefined,
      name: String(raw.name || "").trim() || "Line item",
      qty: Math.max(1, Number(raw.qty) || 1),
      unitPrice: Math.max(0, Number(raw.unitPrice) || 0),
    }))
    .filter((i) => i.name);
  if (!items.length) return { error: "Add at least one line item", code: "ITEMS_REQUIRED" };

  const subtotal = Number(
    items.reduce((s, i) => s + i.qty * i.unitPrice, 0).toFixed(2)
  );
  const microsoftCost = Number(
    input.microsoftCost ?? Number((subtotal * 0.82).toFixed(2))
  );
  const netrichMarkup = Number(
    input.netrichMarkup ?? Number((subtotal - microsoftCost).toFixed(2))
  );
  const taxRate = Number(input.taxRate ?? 5);
  const tax = Number(input.tax ?? Number(((subtotal * taxRate) / 100).toFixed(2)));
  const total = Number((subtotal + tax).toFixed(2));
  const now = new Date().toISOString();

  const invoice: PlatformInvoice = {
    id: `inv-${Date.now().toString(36)}`,
    customerId: input.customerId,
    customerName: customer.name,
    quoteId: input.quoteId,
    orderId: input.orderId,
    period: input.period || now.slice(0, 7),
    currency: input.currency || "USD",
    items,
    microsoftCost,
    netrichMarkup,
    taxRate,
    tax,
    subtotal,
    total,
    status: input.status || "draft",
    notes: input.notes,
    dueAt: input.dueAt || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  const platform = loadPlatform();
  if (!platform.invoices) platform.invoices = [];
  platform.invoices.unshift(invoice);
  savePlatform(platform);
  return { invoice };
}

export function computePrice(productId: string, customerId?: string) {
  const p = loadPlatform();
  const list = p.priceLists[0];
  const item = list?.items.find((i) => i.productId === productId);
  if (!item) return null;
  const rule = customerId
    ? p.customerPriceRules.find((r) => r.customerId === customerId && r.productId === productId)
    : undefined;
  const discount = rule ? (item.netrichPrice * rule.discountPct) / 100 : item.customerDiscount;
  const customerPrice = Math.max(0, item.netrichPrice - discount);
  const margin = customerPrice - item.partnerCost;
  return {
    currency: list.currency,
    listPrice: item.listPrice,
    partnerCost: item.partnerCost,
    netrichPrice: item.netrichPrice,
    customerDiscount: discount,
    customerPrice,
    margin,
  };
}

export function renewalsWindow(days: number) {
  const out: Array<{
    customerId: string;
    customerName: string;
    product: string;
    renewal: string;
    seats: number;
  }> = [];
  const cutoff = Date.now() + days * 864e5;
  for (const c of loadCustomers()) {
    for (const s of listTenantSubscriptions(c.id)) {
      const t = new Date(s.nextRenewal).getTime();
      if (t <= cutoff) {
        out.push({
          customerId: c.id,
          customerName: c.name,
          product: s.name,
          renewal: s.nextRenewal,
          seats: s.purchased,
        });
      }
    }
  }
  return out.sort((a, b) => a.renewal.localeCompare(b.renewal));
}

export function partnerReporting() {
  const customers = loadCustomers();
  const active = customers.filter((c) => c.status === "active");
  let seats = 0;
  let mrr = 0;
  let microsoftCost = 0;
  for (const c of customers) {
    for (const s of listTenantSubscriptions(c.id)) {
      seats += s.purchased;
      const monthly =
        s.billingCycle === "Annual"
          ? s.price / 12
          : s.billingCycle === "Triennial"
            ? s.price / 36
            : s.price;
      mrr += monthly;
      microsoftCost += monthly * 0.82;
    }
  }
  const p = loadPlatform();
  const gdapExpiring = p.domains.length; // placeholder count from health
  const platform = loadPlatform();
  const failedJobs = platform.jobs.filter((j) => j.status === "failed" || j.status === "dead_letter").length;
  return {
    customers: customers.length,
    activeTenants: active.length,
    seats,
    mrr: Math.round(mrr * 100) / 100,
    microsoftCost: Math.round(microsoftCost * 100) / 100,
    grossMargin: Math.round((mrr - microsoftCost) * 100) / 100,
    renewals30: renewalsWindow(30).length,
    gdapExpiring: platform.notifications.filter((n) => n.type === "gdap.expiring").length || gdapExpiring,
    failedSyncs: failedJobs,
    openP1: 0,
  };
}

export function idempotencyGet(key: string, operation: string) {
  const p = loadPlatform();
  const hit = p.idempotency.find(
    (i) => i.key === key && i.operation === operation && new Date(i.expiresAt).getTime() > Date.now()
  );
  return hit || null;
}

export function idempotencyPut(input: {
  key: string;
  customerId: string;
  operation: string;
  body: unknown;
  responseCode: number;
  responseBody: unknown;
}) {
  const p = loadPlatform();
  const requestHash = createHash("sha256").update(JSON.stringify(input.body)).digest("hex");
  const existing = p.idempotency.find((i) => i.key === input.key && i.operation === input.operation);
  if (existing) {
    if (existing.requestHash !== requestHash) {
      return { conflict: true as const };
    }
    return { replay: existing };
  }
  const rec = {
    key: input.key,
    customerId: input.customerId,
    operation: input.operation,
    requestHash,
    status: "completed",
    responseCode: input.responseCode,
    responseBody: input.responseBody,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 3600e3).toISOString(),
  };
  p.idempotency.unshift(rec);
  savePlatform(p);
  return { stored: rec };
}

export function trackSession(input: {
  userId: string;
  email: string;
  ip?: string;
  userAgent?: string;
}) {
  const p = loadPlatform();
  const id = `sess-${randomBytes(6).toString("hex")}`;
  const now = new Date().toISOString();
  p.sessions = p.sessions.map((s) =>
    s.userId === input.userId ? { ...s, current: false } : s
  );
  p.sessions.unshift({
    id,
    userId: input.userId,
    email: input.email,
    ip: input.ip || "127.0.0.1",
    userAgent: input.userAgent || "unknown",
    createdAt: now,
    lastSeen: now,
    expiresAt: new Date(Date.now() + 8 * 3600e3).toISOString(),
    current: true,
  });
  savePlatform(p);
  return id;
}

export function licenseOptimization(customerId: string) {
  const subs = listTenantSubscriptions(customerId);
  let purchased = 0;
  let assigned = 0;
  const recommendations: Array<{ product: string; unused: number; saving: number }> = [];
  for (const s of subs) {
    purchased += s.purchased;
    assigned += s.used;
    const unused = Math.max(0, s.purchased - s.used);
    if (unused > 0) {
      const unit =
        s.billingCycle === "Annual" ? s.price / 12 / s.purchased : s.price / Math.max(1, s.purchased);
      recommendations.push({
        product: s.name,
        unused,
        saving: Math.round(unused * unit * 100) / 100,
      });
    }
  }
  return {
    purchased,
    assigned,
    unused: purchased - assigned,
    potentialSavings: recommendations.reduce((a, r) => a + r.saving, 0),
    recommendations,
  };
}
