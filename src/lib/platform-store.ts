/**
 * Foundation platform store — completes Phase-1 PARTIAL modules with durable local SoR
 * (works without Docker; Nest/Postgres remains preferred when up).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import path from "path";
import { createHash, randomBytes } from "crypto";
import { loadCustomers } from "@/lib/customer-store";
import { listTenantSubscriptions } from "@/lib/subscription-store";

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

  if (!base.jobs.length) {
    const now = new Date().toISOString();
    base.jobs = [
      {
        id: "job-catalog-1",
        name: "catalog.sync",
        queue: "microsoft-sync",
        status: "succeeded",
        attempts: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "job-gdap-1",
        name: "gdap.sync",
        queue: "microsoft-sync",
        status: "succeeded",
        attempts: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "job-fail-1",
        name: "subscriptions.sync",
        queue: "microsoft-sync",
        customerId: customers[0]?.id,
        status: "dead_letter",
        attempts: 5,
        lastError: "Simulated throttle — Retry-After exceeded (Foundation stub)",
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  for (const c of customers) {
    if (!base.contacts.some((x) => x.customerId === c.id)) {
      base.contacts.push(
        {
          id: `ct-${c.id}-primary`,
          customerId: c.id,
          type: "PRIMARY",
          name: `${c.name} Admin`,
          email: c.adminEmail,
        },
        {
          id: `ct-${c.id}-billing`,
          customerId: c.id,
          type: "BILLING",
          name: "Billing Contact",
          email: c.config?.billingContactEmail || c.adminEmail,
        },
        {
          id: `ct-${c.id}-tech`,
          customerId: c.id,
          type: "TECHNICAL",
          name: "Technical Contact",
          email: c.config?.technicalContactEmail || c.adminEmail,
        }
      );
    }
    if (!base.domains.some((d) => d.customerId === c.id)) {
      base.domains.push(
        {
          id: `dom-${c.id}-1`,
          customerId: c.id,
          name: c.domain,
          verified: true,
          primary: true,
          dns: { mx: true, spf: true, dkim: true, dmarc: c.status === "active", autodiscover: true },
        },
        {
          id: `dom-${c.id}-onms`,
          customerId: c.id,
          name: `${c.domain.split(".")[0] || "contoso"}.onmicrosoft.com`,
          verified: true,
          primary: false,
          dns: { mx: true, spf: true, dkim: false, dmarc: false, autodiscover: true },
        }
      );
    }
    if (!base.serviceHealth[c.id]) {
      base.serviceHealth[c.id] = [
        { service: "Exchange Online", status: "Healthy" },
        { service: "Microsoft Teams", status: c.id.includes("orbit") ? "Advisory" : "Healthy", detail: c.id.includes("orbit") ? "Intermittent meeting join latency" : undefined },
        { service: "SharePoint Online", status: "Healthy" },
        { service: "Entra ID", status: "Healthy" },
        { service: "Microsoft Defender", status: "Healthy" },
      ];
    }
    if (!base.security[c.id]) {
      base.security[c.id] = {
        secureScore: 62 + (c.usersCount % 20),
        mfaCoverage: 88 + (c.usersCount % 10),
        privilegedUsers: 4 + (c.usersCount % 5),
        riskyUsers: c.status === "active" ? 1 : 2,
        disabledUsers: 3,
        staleAccounts: 8 + (c.usersCount % 12),
        guestAccounts: 10 + (c.usersCount % 15),
        legacyAuth: 0,
        adminMfa: 100,
        recommendations: [
          { severity: "HIGH", text: "2 global admins lack PIM" },
          { severity: "HIGH", text: "Review risky sign-ins" },
          { severity: "MEDIUM", text: `${8 + (c.usersCount % 12)} inactive accounts` },
          { severity: "LOW", text: "Unused licenses detected" },
        ],
      };
    }
    if (!base.graphSync.some((g) => g.customerId === c.id)) {
      base.graphSync.push(
        {
          customerId: c.id,
          resource: "users",
          deltaLink: `https://graph.microsoft.com/v1.0/users/delta?$deltatoken=stub-${c.id}`,
          lastFullSync: new Date(Date.now() - 7 * 864e5).toISOString(),
          lastDeltaSync: new Date(Date.now() - 2 * 3600e3).toISOString(),
          status: "idle",
        },
        {
          customerId: c.id,
          resource: "subscribedSkus",
          lastFullSync: new Date(Date.now() - 864e5).toISOString(),
          lastDeltaSync: new Date(Date.now() - 3600e3).toISOString(),
          status: "idle",
        }
      );
    }
    if (!base.notifications.some((n) => n.customerId === c.id && n.type === "gdap.expiring")) {
      base.notifications.push({
        id: `ntf-${c.id}-gdap`,
        customerId: c.id,
        type: "gdap.expiring",
        severity: "warning",
        title: "GDAP relationship expiring",
        message: `GDAP for ${c.name} expires within 100 days. Review renew.`,
        actionUrl: `/admin/gdap`,
        createdAt: new Date().toISOString(),
      });
    }
  }

  if (!base.quotes.length && customers[0]) {
    base.quotes.push({
      id: "qt-demo-1",
      customerId: customers[0].id,
      status: "draft",
      currency: "USD",
      items: [
        {
          productId: "m365-business-premium",
          name: "Microsoft 365 Business Premium",
          qty: 25,
          unitPrice: 19.25,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  if (!base.orders.length && customers[0]) {
    const now = new Date().toISOString();
    base.orders.push(
      {
        id: "ord-demo-1",
        customerId: customers[0].id,
        quoteId: "qt-demo-1",
        status: "FULFILLED",
        items: [{ name: "Microsoft 365 Business Premium", qty: 25, unitPrice: 19.25 }],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "ord-demo-2",
        customerId: customers[0].id,
        status: "PROVISIONING",
        items: [{ name: "Microsoft 365 Business Standard", qty: 10, unitPrice: 11.0 }],
        createdAt: now,
        updatedAt: now,
      }
    );
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
    return ensureSeed(JSON.parse(readFileSync(FILE, "utf8")) as PlatformFile);
  } catch {
    return ensureSeed(empty());
  }
}

export function savePlatform(data: PlatformFile) {
  atomicWrite(FILE, JSON.stringify(data, null, 2));
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
