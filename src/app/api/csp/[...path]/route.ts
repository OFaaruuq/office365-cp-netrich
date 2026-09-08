import { NextRequest, NextResponse } from "next/server";
import { requirePartnerAdmin, requireSession } from "@/lib/auth/guards";
import { loadCustomers, findCustomer, saveCustomers } from "@/lib/customer-store";
import { writeAudit } from "@/lib/audit-log";
import {
  computePrice,
  licenseOptimization,
  loadPlatform,
  partnerReporting,
  renewalsWindow,
  savePlatform,
  trackSession,
} from "@/lib/platform-store";
import {
  formatGdap,
  loadFoundation,
  platformHealthLocal,
  saveFoundation,
  summarizeOnboarding,
  type OnboardingStepKey,
} from "@/lib/foundation-store";
import { cspApiBase } from "@/lib/csp-api";
import { PERMISSIONS, ROLE_PACKS, LEGACY_ROLE_MAP } from "@/lib/rbac-catalog";

async function tryNest(path: string, init?: RequestInit): Promise<Response | null> {
  try {
    const res = await fetch(`${cspApiBase()}${path}`, {
      ...init,
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });
    if (res.ok) return res;
  } catch {
    /* fallback local */
  }
  return null;
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  const url = new URL(request.url);

  // Partner-only routes
  const partnerPaths = [
    "gdap",
    "flags",
    "approvals",
    "jobs",
    "reporting",
    "price-lists",
    "quotes",
    "invoices",
    "orders",
    "subscriptions",
    "graph-sync",
  ];
  const needsPartner =
    partnerPaths.some((p) => joined === p || joined.startsWith(p + "/")) ||
    joined === "customers" ||
    joined === "microsoft/integration" ||
    joined === "health" ||
    joined === "platform/health" ||
    joined === "rbac/roles" ||
    joined === "rbac/permissions";

  if (needsPartner) {
    const auth = await requirePartnerAdmin(request);
    if ("error" in auth) return auth.error;
  } else if (
    joined.startsWith("customers/") ||
    joined.startsWith("notifications") ||
    joined.startsWith("sessions") ||
    joined.startsWith("service-health") ||
    joined.startsWith("security") ||
    joined.startsWith("domains") ||
    joined.startsWith("contacts") ||
    joined.startsWith("billing") ||
    joined.startsWith("license-optimization") ||
    joined.startsWith("notification-prefs") ||
    joined === "renewals" ||
    joined === "audit" ||
    joined === "portal-admins"
  ) {
    const auth = await requireSession(request);
    if ("error" in auth) return auth.error;
  }

  const nest = await tryNest(`/v1/${joined}${url.search}`);
  if (nest && (joined === "health" || joined.startsWith("customers") || joined === "gdap" || joined.startsWith("rbac") || joined === "flags" || joined.startsWith("microsoft") || joined === "audit")) {
    const data = await nest.json();
    return NextResponse.json({ ...data, source: "nest" });
  }

  const platform = loadPlatform();

  if (joined === "health" || joined === "platform/health") {
    const local = platformHealthLocal();
    return NextResponse.json({
      ...local,
      failedJobs: platform.jobs.filter((j) => j.status === "dead_letter" || j.status === "failed").length,
      queueDepth: platform.jobs.filter((j) => j.status === "queued" || j.status === "running").length,
      lastCatalogSync: platform.jobs.find((j) => j.name === "catalog.sync")?.updatedAt,
      source: "local",
    });
  }

  if (joined === "microsoft/integration") {
    return NextResponse.json({
      mode: "sandbox",
      keyVaultConfigured: false,
      partnerCenterWritesEnabled: false,
      authStrategy:
        "Per-operation App+User (GDAP consent) or partner app credentials with certificates",
      components: platformHealthLocal().microsoft,
      certificateRotation: { partnerCertDaysRemaining: null, detail: "Configure AZURE_KEY_VAULT_URI" },
      source: "local",
    });
  }

  if (joined === "reporting") {
    return NextResponse.json({ ...partnerReporting(), source: "local" });
  }

  if (joined === "renewals") {
    const auth = await requireSession(request);
    if ("error" in auth) return auth.error;
    const days = Number(url.searchParams.get("days") || 90);
    let renewals = renewalsWindow(days);
    if (auth.session.role !== "partner_admin") {
      renewals = renewals.filter((r) => r.customerId === auth.session.customerId);
    } else {
      const filterId = url.searchParams.get("customerId");
      if (filterId) renewals = renewals.filter((r) => r.customerId === filterId);
    }
    return NextResponse.json({
      days,
      renewals,
      summary: {
        d30: renewalsWindow(30).length,
        d60: renewalsWindow(60).length,
        d90: renewalsWindow(90).length,
      },
      source: "local",
    });
  }

  if (joined === "price-lists") {
    return NextResponse.json({
      priceLists: platform.priceLists,
      customerPriceRules: platform.customerPriceRules,
      source: "local",
    });
  }

  if (joined === "quotes") {
    const customerId = url.searchParams.get("customerId");
    let quotes = platform.quotes;
    if (customerId) quotes = quotes.filter((q) => q.customerId === customerId);
    return NextResponse.json({ quotes, source: "local" });
  }

  if (joined === "invoices") {
    const customerId = url.searchParams.get("customerId");
    let invoices = platform.invoices || [];
    if (customerId) invoices = invoices.filter((inv) => inv.customerId === customerId);
    return NextResponse.json({ invoices, source: "local" });
  }

  if (joined === "orders") {
    const customerId = url.searchParams.get("customerId");
    let orders = platform.orders || [];
    if (customerId) orders = orders.filter((o) => o.customerId === customerId);
    return NextResponse.json({ orders, source: "local" });
  }

  if (joined === "subscriptions") {
    const customers = loadCustomers();
    const rows: Array<{
      customerId: string;
      customerName: string;
      id: string;
      name: string;
      purchased: number;
      used: number;
      billingCycle: string;
      nextRenewal: string;
      price: number;
    }> = [];
    const { listTenantSubscriptions } = await import("@/lib/subscription-store");
    for (const c of customers) {
      for (const s of listTenantSubscriptions(c.id)) {
        rows.push({
          customerId: c.id,
          customerName: c.name,
          id: s.id,
          name: s.name,
          purchased: s.purchased,
          used: s.used,
          billingCycle: s.billingCycle,
          nextRenewal: s.nextRenewal,
          price: s.price,
        });
      }
    }
    return NextResponse.json({ subscriptions: rows, source: "local" });
  }

  if (joined === "jobs") {
    const status = url.searchParams.get("status");
    let jobs = platform.jobs;
    if (status === "dead_letter") {
      jobs = jobs.filter((j) => j.status === "dead_letter" || j.status === "failed");
    }
    return NextResponse.json({ jobs, source: "local" });
  }

  if (joined === "approvals") {
    return NextResponse.json({ approvals: platform.approvals, source: "local" });
  }

  if (joined === "graph-sync") {
    return NextResponse.json({ states: platform.graphSync, source: "local" });
  }

  if (joined === "flags") {
    const data = loadFoundation();
    return NextResponse.json({
      flags: data.flags.map((f) => ({ ...f, enabled: f.enabledGlobal })),
      source: "local",
    });
  }

  if (joined === "gdap") {
    const data = loadFoundation();
    const days = url.searchParams.get("expiringWithinDays");
    let rows = data.gdap.map((g) => {
      const customer = loadCustomers().find((c) => c.id === g.customerId);
      return {
        ...formatGdap(g),
        customer: customer ? { id: customer.id, name: customer.name, domain: customer.domain } : null,
      };
    });
    if (days) {
      const n = Number(days);
      rows = rows.filter(
        (r) => r.remainingDays != null && r.remainingDays >= 0 && r.remainingDays <= n
      );
    }
    return NextResponse.json({ relationships: rows, source: "local" });
  }

  if (joined === "customers") {
    const customers = loadCustomers().map((c) => ({
      ...c,
      onboarding: summarizeOnboarding(c.id),
      gdap: loadFoundation()
        .gdap.filter((g) => g.customerId === c.id)
        .map(formatGdap),
      contacts: platform.contacts.filter((x) => x.customerId === c.id),
      domains: platform.domains.filter((d) => d.customerId === c.id),
    }));
    return NextResponse.json({ customers, source: "local" });
  }

  if (joined.startsWith("customers/")) {
    const auth = await requireSession(request);
    if ("error" in auth) return auth.error;
    const id = joined.slice("customers/".length).split("/")[0];
    if (auth.session.role !== "partner_admin" && auth.session.customerId !== id) {
      return NextResponse.json({ error: "Forbidden", code: "TENANT_ISOLATION" }, { status: 403 });
    }
    const c = findCustomer(id);
    if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      customer: c,
      onboarding: summarizeOnboarding(c.id),
      gdap: loadFoundation()
        .gdap.filter((g) => g.customerId === c.id)
        .map(formatGdap),
      contacts: platform.contacts.filter((x) => x.customerId === c.id),
      domains: platform.domains.filter((d) => d.customerId === c.id),
      security: platform.security[c.id],
      serviceHealth: platform.serviceHealth[c.id],
      licenseOptimization: licenseOptimization(c.id),
      graphSync: platform.graphSync.filter((g) => g.customerId === c.id),
      source: "local",
    });
  }

  if (joined === "audit") {
    const auth = await requireSession(request);
    if ("error" in auth) return auth.error;
    const { listAudit } = await import("@/lib/audit-log");
    let customerId = url.searchParams.get("customerId") || undefined;
    if (auth.session.role !== "partner_admin") {
      customerId = auth.session.customerId;
    }
    return NextResponse.json({
      events: listAudit({ customerId, limit: 100 }),
      source: "local",
    });
  }

  if (joined === "portal-admins") {
    const auth = await requireSession(request);
    if ("error" in auth) return auth.error;
    const { listClientAdminAccounts } = await import("@/lib/account-store");
    const { isMfaEnabled } = await import("@/lib/auth/mfa");
    const customerId =
      auth.session.role === "partner_admin"
        ? url.searchParams.get("customerId") || auth.session.customerId
        : auth.session.customerId;
    if (!customerId) {
      return NextResponse.json({ accounts: [], source: "local" });
    }
    if (auth.session.role !== "partner_admin" && auth.session.customerId !== customerId) {
      return NextResponse.json({ error: "Forbidden", code: "TENANT_ISOLATION" }, { status: 403 });
    }
    const accounts = listClientAdminAccounts(customerId).map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      disabled: a.disabled,
      mfa: { enrolled: isMfaEnabled(a.id), enabled: isMfaEnabled(a.id) },
    }));
    return NextResponse.json({ accounts, source: "local" });
  }

  if (joined === "rbac/roles" || joined === "rbac/permissions") {
    return NextResponse.json({
      permissions: PERMISSIONS,
      packs: ROLE_PACKS,
      legacyRoleMap: LEGACY_ROLE_MAP,
      source: "local",
    });
  }

  if (joined === "contacts") {
    const customerId = url.searchParams.get("customerId");
    let rows = platform.contacts;
    if (customerId) rows = rows.filter((c) => c.customerId === customerId);
    return NextResponse.json({ contacts: rows, source: "local" });
  }

  if (joined === "domains") {
    const customerId = url.searchParams.get("customerId");
    let rows = platform.domains;
    if (customerId) rows = rows.filter((d) => d.customerId === customerId);
    return NextResponse.json({ domains: rows, source: "local" });
  }

  if (joined === "service-health") {
    const customerId = url.searchParams.get("customerId") || "";
    return NextResponse.json({
      services: platform.serviceHealth[customerId] || [],
      source: "local",
    });
  }

  if (joined === "security") {
    const customerId = url.searchParams.get("customerId") || "";
    return NextResponse.json({
      security: platform.security[customerId] || null,
      source: "local",
    });
  }

  if (joined === "license-optimization") {
    const customerId = url.searchParams.get("customerId") || "";
    return NextResponse.json({ ...licenseOptimization(customerId), source: "local" });
  }

  if (joined === "billing/overview") {
    const customerId = url.searchParams.get("customerId") || "";
    const { listTenantSubscriptions, getTenantCostSummary } = await import(
      "@/lib/subscription-store"
    );
    return NextResponse.json({
      cost: getTenantCostSummary(customerId),
      subscriptions: listTenantSubscriptions(customerId),
      invoices: (platform.invoices || []).filter((inv) => inv.customerId === customerId),
      credits: [],
      source: "local",
    });
  }

  if (joined === "notifications") {
    const auth = await requireSession(request);
    if ("error" in auth) return auth.error;
    const userId = auth.session.accountId;
    const customerId = auth.session.customerId;
    const rows = platform.notifications.filter(
      (n) =>
        (!n.userId || n.userId === userId) &&
        (!n.customerId || n.customerId === customerId || auth.session.role === "partner_admin")
    );
    return NextResponse.json({ notifications: rows, source: "local" });
  }

  if (joined === "notification-prefs") {
    const auth = await requireSession(request);
    if ("error" in auth) return auth.error;
    const pref = platform.notificationPrefs.find((p) => p.userId === auth.session.accountId) || {
      userId: auth.session.accountId,
      renewals: ["email", "portal"],
      security: ["email", "portal"],
      invoices: ["email"],
      support: ["portal", "email"],
      incidents: ["portal"],
    };
    return NextResponse.json({ preferences: pref, source: "local" });
  }

  if (joined === "sessions") {
    const auth = await requireSession(request);
    if ("error" in auth) return auth.error;
    const rows = platform.sessions.filter(
      (s) => s.userId === auth.session.accountId && !s.revokedAt
    );
    return NextResponse.json({ sessions: rows, source: "local" });
  }

  if (joined === "pricing/compute") {
    const productId = url.searchParams.get("productId") || "";
    const customerId = url.searchParams.get("customerId") || undefined;
    return NextResponse.json({ price: computePrice(productId, customerId), source: "local" });
  }

  if (joined === "break-glass") {
    const auth = await requirePartnerAdmin(request);
    if ("error" in auth) return auth.error;
    return NextResponse.json({ emails: platform.breakGlassEmails, source: "local" });
  }

  if (joined === "catalog/metadata") {
    const auth = await requirePartnerAdmin(request);
    if ("error" in auth) return auth.error;
    const { listCatalogProducts } = await import("@/lib/catalog-store");
    const products = listCatalogProducts().map((p) => ({
      id: p.id,
      name: p.name,
      catalog: p.catalog,
      category: p.category,
      sku: p.id,
      billing: ["Monthly", "Annual", "Triennial"],
      term: ["P1M", "P1Y", "P3Y"],
      segment: p.category,
      availability: p.status,
      priceMonthly: p.priceMonthly,
      priceYearly: p.priceYearly,
    }));
    return NextResponse.json({ products, source: "local" });
  }

  return NextResponse.json({ error: `Unknown CSP path: ${joined}`, code: "NOT_FOUND" }, { status: 404 });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  const body = await request.json().catch(() => ({}));
  const platform = loadPlatform();

  if (joined === "admin-access") {
    const auth = await requirePartnerAdmin(request);
    if ("error" in auth) return auth.error;
    const reason = String(body.reason || "").trim();
    const customerId = String(body.customerId || "");
    if (!reason || !customerId) {
      return NextResponse.json({ error: "customerId and reason required" }, { status: 400 });
    }
    const minutes = Math.min(Math.max(Number(body.durationMinutes) || 15, 5), 120);
    const data = loadFoundation();
    const session = {
      id: `vas-${Date.now().toString(36)}`,
      actorUserId: auth.session.accountId,
      customerId,
      reason,
      readOnly: body.readOnly !== false,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
    };
    data.adminAccess.unshift(session);
    saveFoundation(data);
    const customer = findCustomer(customerId);
    writeAudit({
      action: "tenant.inspect",
      actorAccountId: auth.session.accountId,
      actorEmail: auth.session.email,
      actorRole: auth.session.role,
      customerId,
      detail: `View-as-customer: ${reason}`,
      meta: { adminAccessSessionId: session.id, risk_level: "high" },
    });
    return NextResponse.json({
      session: {
        ...session,
        customerName: customer?.name,
        banner: `Viewing ${customer?.name || customerId} as Partner Administrator (read-only)`,
      },
      source: "local",
    });
  }

  if (joined === "approvals") {
    const auth = await requirePartnerAdmin(request);
    if ("error" in auth) return auth.error;
    const item = {
      id: `apr-${Date.now().toString(36)}`,
      operation: String(body.operation || ""),
      customerId: body.customerId ? String(body.customerId) : undefined,
      requesterEmail: auth.session.email,
      status: "pending" as const,
      payload: body.payload,
      createdAt: new Date().toISOString(),
    };
    platform.approvals.unshift(item);
    savePlatform(platform);
    writeAudit({
      action: "tenant.configure",
      actorAccountId: auth.session.accountId,
      actorEmail: auth.session.email,
      actorRole: auth.session.role,
      customerId: item.customerId,
      detail: `Approval requested: ${item.operation}`,
      meta: { approvalId: item.id, risk_level: "high" },
    });
    return NextResponse.json({ approval: item, source: "local" });
  }

  if (joined.startsWith("approvals/") && joined.endsWith("/decide")) {
    const auth = await requirePartnerAdmin(request);
    if ("error" in auth) return auth.error;
    const id = joined.split("/")[1];
    const item = platform.approvals.find((a) => a.id === id);
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (item.requesterEmail === auth.session.email) {
      return NextResponse.json(
        { error: "Four-eyes: requester cannot approve own request", code: "SELF_APPROVE" },
        { status: 400 }
      );
    }
    item.status = body.decision === "approved" ? "approved" : "rejected";
    item.decidedAt = new Date().toISOString();
    item.approverEmail = auth.session.email;
    savePlatform(platform);
    return NextResponse.json({ approval: item, source: "local" });
  }

  if (joined === "quotes") {
    const auth = await requirePartnerAdmin(request);
    if ("error" in auth) return auth.error;
    const customerId = String(body.customerId || "");
    const customer = findCustomer(customerId);
    if (!customer) {
      return NextResponse.json({ error: "Customer required", code: "CUSTOMER_REQUIRED" }, { status: 400 });
    }
    const items = Array.isArray(body.items)
      ? body.items
          .map((raw: Record<string, unknown>) => ({
            productId: String(raw.productId || ""),
            name: String(raw.name || "Line item"),
            qty: Math.max(1, Number(raw.qty) || 1),
            unitPrice: Number(raw.unitPrice) || 0,
          }))
          .filter((i: { name: string }) => i.name)
      : [];
    if (!items.length) {
      return NextResponse.json({ error: "Add at least one line item", code: "ITEMS_REQUIRED" }, { status: 400 });
    }
    const q = {
      id: `qt-${Date.now().toString(36)}`,
      customerId,
      status: "draft" as const,
      currency: String(body.currency || "USD"),
      items,
      notes: body.notes ? String(body.notes) : undefined,
      validUntil: body.validUntil ? String(body.validUntil) : undefined,
      createdBy: auth.session.email,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    platform.quotes.unshift(q);
    savePlatform(platform);
    writeAudit({
      action: "commerce.subscribe",
      actorAccountId: auth.session.accountId,
      actorEmail: auth.session.email,
      actorRole: auth.session.role,
      customerId,
      detail: `Generated quote ${q.id} for ${customer.name} (${items.length} line item(s))`,
      meta: { quoteId: q.id },
      riskLevel: "low",
    });
    return NextResponse.json({ quote: q, source: "local" });
  }

  if (joined === "invoices") {
    const auth = await requirePartnerAdmin(request);
    if ("error" in auth) return auth.error;
    const customerId = String(body.customerId || "");
    const customer = findCustomer(customerId);
    if (!customer) {
      return NextResponse.json({ error: "Customer required", code: "CUSTOMER_REQUIRED" }, { status: 400 });
    }
    const items = Array.isArray(body.items)
      ? body.items
          .map((raw: Record<string, unknown>) => ({
            productId: raw.productId ? String(raw.productId) : undefined,
            name: String(raw.name || "Line item"),
            qty: Math.max(1, Number(raw.qty) || 1),
            unitPrice: Number(raw.unitPrice) || 0,
          }))
          .filter((i: { name: string }) => i.name)
      : [];
    if (!items.length) {
      return NextResponse.json({ error: "Add at least one line item", code: "ITEMS_REQUIRED" }, { status: 400 });
    }
    const subtotal = Number(
      items.reduce((s: number, i: { qty: number; unitPrice: number }) => s + i.qty * i.unitPrice, 0).toFixed(2)
    );
    const microsoftCost = Number(body.microsoftCost ?? Number((subtotal * 0.82).toFixed(2)));
    const netrichMarkup = Number(body.netrichMarkup ?? Number((subtotal - microsoftCost).toFixed(2)));
    const taxRate = Number(body.taxRate ?? 5);
    const tax = Number(body.tax ?? Number(((subtotal * taxRate) / 100).toFixed(2)));
    const total = Number((subtotal + tax).toFixed(2));
    const inv = {
      id: `inv-${Date.now().toString(36)}`,
      customerId,
      customerName: customer.name,
      quoteId: body.quoteId ? String(body.quoteId) : undefined,
      orderId: body.orderId ? String(body.orderId) : undefined,
      period: String(body.period || new Date().toISOString().slice(0, 7)),
      currency: String(body.currency || "USD"),
      items,
      microsoftCost,
      netrichMarkup,
      taxRate,
      tax,
      subtotal,
      total,
      status: (body.status as "draft" | "sent" | "open") || "draft",
      notes: body.notes ? String(body.notes) : undefined,
      dueAt: body.dueAt
        ? String(body.dueAt)
        : new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      createdBy: auth.session.email,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (!platform.invoices) platform.invoices = [];
    platform.invoices.unshift(inv);
    savePlatform(platform);
    writeAudit({
      action: "commerce.subscribe",
      actorAccountId: auth.session.accountId,
      actorEmail: auth.session.email,
      actorRole: auth.session.role,
      customerId,
      detail: `Generated invoice ${inv.id} for ${customer.name} ($${total.toFixed(2)})`,
      meta: { invoiceId: inv.id, total },
      riskLevel: "medium",
    });
    return NextResponse.json({ invoice: inv, source: "local" });
  }

  if (joined === "jobs/retry") {
    const auth = await requirePartnerAdmin(request);
    if ("error" in auth) return auth.error;
    const job = platform.jobs.find((j) => j.id === body.jobId);
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    job.status = "queued";
    job.attempts += 1;
    job.lastError = undefined;
    job.updatedAt = new Date().toISOString();
    savePlatform(platform);
    return NextResponse.json({ job, source: "local" });
  }

  if (joined === "sessions/track") {
    const auth = await requireSession(request);
    if ("error" in auth) return auth.error;
    const id = trackSession({
      userId: auth.session.accountId,
      email: auth.session.email,
      ip: request.headers.get("x-forwarded-for") || undefined,
      userAgent: request.headers.get("user-agent") || undefined,
    });
    return NextResponse.json({ sessionId: id, source: "local" });
  }

  if (joined === "contacts") {
    const auth = await requirePartnerAdmin(request);
    if ("error" in auth) return auth.error;
    const contact = {
      id: `ct-${Date.now().toString(36)}`,
      customerId: String(body.customerId || ""),
      type: body.type || "PRIMARY",
      name: String(body.name || ""),
      email: String(body.email || ""),
      phone: body.phone ? String(body.phone) : undefined,
    };
    platform.contacts.push(contact);
    savePlatform(platform);
    return NextResponse.json({ contact, source: "local" });
  }

  if (joined === "break-glass") {
    const auth = await requirePartnerAdmin(request);
    if ("error" in auth) return auth.error;
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
    if (!platform.breakGlassEmails.includes(email)) {
      platform.breakGlassEmails.push(email);
      savePlatform(platform);
    }
    writeAudit({
      action: "tenant.configure",
      actorAccountId: auth.session.accountId,
      actorEmail: auth.session.email,
      actorRole: auth.session.role,
      detail: `Break-glass account allowed: ${email}`,
      meta: { risk_level: "critical" },
    });
    return NextResponse.json({ emails: platform.breakGlassEmails, source: "local" });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const auth = await requirePartnerAdmin(request);
  if ("error" in auth && !String((await ctx.params).path.join("/")).startsWith("notification")) {
    // allow client for some patches below
  }

  const { path } = await ctx.params;
  const joined = path.join("/");
  const body = await request.json().catch(() => ({}));
  const platform = loadPlatform();

  const m = joined.match(/^onboarding\/([^/]+)\/steps\/([^/]+)$/);
  if (m) {
    const partner = await requirePartnerAdmin(request);
    if ("error" in partner) return partner.error;
    const customerId = m[1];
    const stepKey = m[2] as OnboardingStepKey;
    const data = loadFoundation();
    if (!data.onboarding[customerId]) data.onboarding[customerId] = {};
    data.onboarding[customerId][stepKey] = body.completed !== false;
    saveFoundation(data);
    writeAudit({
      action: "tenant.configure",
      actorAccountId: partner.session.accountId,
      actorEmail: partner.session.email,
      actorRole: partner.session.role,
      customerId,
      detail: `Onboarding step ${stepKey} = ${body.completed !== false}`,
    });
    return NextResponse.json({ onboarding: summarizeOnboarding(customerId), source: "local" });
  }

  if (joined.startsWith("quotes/")) {
    const partner = await requirePartnerAdmin(request);
    if ("error" in partner) return partner.error;
    const id = joined.split("/")[1];
    const q = platform.quotes.find((x) => x.id === id);
    if (!q) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const prev = q.status;
    if (body.status) q.status = body.status;
    if (body.items) q.items = body.items;
    if (body.notes != null) q.notes = String(body.notes);
    if (body.validUntil != null) q.validUntil = String(body.validUntil);
    q.updatedAt = new Date().toISOString();

    let order = null;
    if (body.status === "ordered" && prev !== "ordered") {
      order = {
        id: `ord-${Date.now().toString(36)}`,
        customerId: q.customerId,
        quoteId: q.id,
        status: "AWAITING_APPROVAL" as const,
        items: q.items.map((i) => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      platform.orders.unshift(order);
    }
    savePlatform(platform);
    return NextResponse.json({ quote: q, order, source: "local" });
  }

  if (joined.startsWith("invoices/")) {
    const partner = await requirePartnerAdmin(request);
    if ("error" in partner) return partner.error;
    const id = joined.split("/")[1];
    const inv = (platform.invoices || []).find((x) => x.id === id);
    if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (body.status) {
      inv.status = body.status;
      if (body.status === "paid") inv.paidAt = new Date().toISOString();
    }
    if (body.notes != null) inv.notes = String(body.notes);
    if (body.dueAt != null) inv.dueAt = String(body.dueAt);
    inv.updatedAt = new Date().toISOString();
    savePlatform(platform);
    return NextResponse.json({ invoice: inv, source: "local" });
  }

  if (joined === "notification-prefs") {
    const session = await requireSession(request);
    if ("error" in session) return session.error;
    const idx = platform.notificationPrefs.findIndex((p) => p.userId === session.session.accountId);
    const pref = {
      userId: session.session.accountId,
      renewals: body.renewals || ["email", "portal"],
      security: body.security || ["email", "portal"],
      invoices: body.invoices || ["email"],
      support: body.support || ["portal", "email"],
      incidents: body.incidents || ["portal"],
    };
    if (idx >= 0) platform.notificationPrefs[idx] = pref;
    else platform.notificationPrefs.push(pref);
    savePlatform(platform);
    return NextResponse.json({ preferences: pref, source: "local" });
  }

  if (joined.startsWith("notifications/") && joined.endsWith("/read")) {
    const session = await requireSession(request);
    if ("error" in session) return session.error;
    const id = joined.split("/")[1];
    const n = platform.notifications.find((x) => x.id === id);
    if (n) {
      n.readAt = new Date().toISOString();
      savePlatform(platform);
    }
    return NextResponse.json({ ok: true, source: "local" });
  }

  if (joined.startsWith("sessions/") && joined.endsWith("/revoke")) {
    const session = await requireSession(request);
    if ("error" in session) return session.error;
    const id = joined.split("/")[1];
    if (id === "all") {
      platform.sessions = platform.sessions.map((s) =>
        s.userId === session.session.accountId ? { ...s, revokedAt: new Date().toISOString(), current: false } : s
      );
    } else {
      const s = platform.sessions.find((x) => x.id === id && x.userId === session.session.accountId);
      if (s) s.revokedAt = new Date().toISOString();
    }
    savePlatform(platform);
    return NextResponse.json({ ok: true, source: "local" });
  }

  if (joined.startsWith("gdap/") && joined.endsWith("/renew")) {
    const partner = await requirePartnerAdmin(request);
    if ("error" in partner) return partner.error;
    const id = joined.split("/")[1];
    const data = loadFoundation();
    const g = data.gdap.find((x) => x.id === id);
    if (!g) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const expires = new Date();
    expires.setDate(expires.getDate() + (g.durationDays || 180));
    g.expiresAt = expires.toISOString();
    g.status = "active";
    saveFoundation(data);
    return NextResponse.json({ relationship: formatGdap(g), source: "local" });
  }

  if (joined.startsWith("customers/") && joined.endsWith("/lifecycle")) {
    const partner = await requirePartnerAdmin(request);
    if ("error" in partner) return partner.error;
    const id = joined.split("/")[1];
    const customers = loadCustomers();
    const idx = customers.findIndex((c) => c.id === id);
    if (idx < 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const lifecycle = String(body.lifecycle || "TERMINATING") as
      | "ACTIVE"
      | "SUSPENDED"
      | "TERMINATING"
      | "RETENTION"
      | "PURGED";
    customers[idx] = {
      ...customers[idx],
      lifecycle,
      status: lifecycle === "ACTIVE" ? "active" : "suspended",
      config: {
        ...customers[idx].config,
        portalAccessEnabled: lifecycle === "ACTIVE",
      },
    };
    saveCustomers(customers);
    return NextResponse.json({ customer: customers[idx], source: "local" });
  }

  if (joined === "break-glass") {
    const partner = await requirePartnerAdmin(request);
    if ("error" in partner) return partner.error;
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
    if (body.remove) {
      platform.breakGlassEmails = platform.breakGlassEmails.filter((e) => e !== email);
    } else if (!platform.breakGlassEmails.includes(email)) {
      platform.breakGlassEmails.push(email);
    }
    savePlatform(platform);
    return NextResponse.json({ emails: platform.breakGlassEmails, source: "local" });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
