import { NextRequest, NextResponse } from "next/server";
import { requirePartnerAdmin, requireSession, denyActiveInspectWrite } from "@/lib/auth/guards";
import { authorizeCspPath } from "@/lib/auth/csp-access";
import { applySessionCookie, activeInspect } from "@/lib/auth/server-session";
import { loadCustomers, findCustomer, saveCustomers } from "@/lib/customer-store";
import { writeAudit } from "@/lib/audit-log";
import {
  computePrice,
  createPlatformInvoice,
  createPlatformQuote,
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
import { cspApiBase, cspInternalHeaders } from "@/lib/csp-api";
import { PERMISSIONS, ROLE_PACKS, LEGACY_ROLE_MAP } from "@/lib/rbac-catalog";
import type { ServerSession } from "@/lib/auth/server-session";

async function tryNest(
  path: string,
  session: ServerSession,
  customerId?: string,
  init?: RequestInit
): Promise<Response | null> {
  try {
    const res = await fetch(`${cspApiBase()}${path}`, {
      ...init,
      headers: {
        ...cspInternalHeaders(session, customerId),
        ...(init?.headers || {}),
      },
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });
    if (res.ok) return res;
  } catch {
    /* fallback local */
  }
  return null;
}

function partnerListCustomerId(
  url: URL,
  session: ServerSession,
  scopedCustomerId?: string
): string | undefined {
  return (
    url.searchParams.get("customerId") ||
    scopedCustomerId ||
    activeInspect(session)?.customerId ||
    undefined
  );
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  const url = new URL(request.url);

  const access = await authorizeCspPath(request, joined);
  if ("error" in access) return access.error;
  const { session } = access;
  const scopedCustomerId = access.customerId;

  const nest = await tryNest(`/v1/${joined}${url.search}`, session, scopedCustomerId);
  if (
    nest &&
    (joined === "health" ||
      joined.startsWith("customers") ||
      joined === "gdap" ||
      joined.startsWith("rbac") ||
      joined === "flags" ||
      joined.startsWith("microsoft") ||
      joined === "audit")
  ) {
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
    const days = Number(url.searchParams.get("days") || 90);
    let renewals = renewalsWindow(days);
    if (session.role !== "partner_admin") {
      renewals = renewals.filter((r) => r.customerId === session.customerId);
    } else {
      const filterId = partnerListCustomerId(url, session, scopedCustomerId);
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
    const filterId = partnerListCustomerId(url, session, scopedCustomerId);
    const customerPriceRules = filterId
      ? platform.customerPriceRules.filter((r) => r.customerId === filterId)
      : platform.customerPriceRules;
    return NextResponse.json({
      priceLists: platform.priceLists,
      customerPriceRules,
      source: "local",
    });
  }

  if (joined === "quotes") {
    const customerId = partnerListCustomerId(url, session, scopedCustomerId);
    let quotes = platform.quotes;
    if (customerId) quotes = quotes.filter((q) => q.customerId === customerId);
    return NextResponse.json({ quotes, source: "local" });
  }

  if (joined === "invoices") {
    const customerId = partnerListCustomerId(url, session, scopedCustomerId);
    let invoices = platform.invoices || [];
    if (customerId) invoices = invoices.filter((inv) => inv.customerId === customerId);
    return NextResponse.json({ invoices, source: "local" });
  }

  if (joined === "orders") {
    const customerId = partnerListCustomerId(url, session, scopedCustomerId);
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
    const filterId = partnerListCustomerId(url, session, scopedCustomerId);
    const scopedCustomers = filterId ? customers.filter((c) => c.id === filterId) : customers;
    for (const c of scopedCustomers) {
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
    const filterId = partnerListCustomerId(url, session, scopedCustomerId);
    let approvals = platform.approvals;
    if (filterId) {
      approvals = approvals.filter((a) => !a.customerId || a.customerId === filterId);
    }
    return NextResponse.json({ approvals, source: "local" });
  }

  if (joined === "graph-sync") {
    const filterId = partnerListCustomerId(url, session, scopedCustomerId);
    const states = filterId
      ? platform.graphSync.filter((g) => g.customerId === filterId)
      : platform.graphSync;
    return NextResponse.json({ states, source: "local" });
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
    const filterId = partnerListCustomerId(url, session, scopedCustomerId);
    let rows = data.gdap
      .filter((g) => !filterId || g.customerId === filterId)
      .map((g) => {
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
    const inspect = activeInspect(session);
    const customers = loadCustomers()
      .filter((c) => !inspect || c.id === inspect.customerId)
      .map((c) => ({
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
    const id = joined.slice("customers/".length).split("/")[0];
    if (session.role !== "partner_admin" && session.customerId !== id) {
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
    const { listAudit } = await import("@/lib/audit-log");
    let customerId = url.searchParams.get("customerId") || undefined;
    if (session.role !== "partner_admin") {
      customerId = session.customerId;
    }
    if (!customerId && session.role !== "partner_admin") {
      return NextResponse.json({ error: "Forbidden", code: "TENANT_ISOLATION" }, { status: 403 });
    }
    return NextResponse.json({
      events: listAudit({ customerId, limit: 100 }),
      source: "local",
    });
  }

  if (joined === "portal-admins") {
    const { listClientAdminAccounts } = await import("@/lib/account-store");
    const { isMfaEnabled } = await import("@/lib/auth/mfa");
    const customerId =
      session.role === "partner_admin"
        ? url.searchParams.get("customerId") || session.customerId
        : session.customerId;
    if (!customerId) {
      return NextResponse.json({ accounts: [], source: "local" });
    }
    if (session.role !== "partner_admin" && session.customerId !== customerId) {
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
    if (!scopedCustomerId) {
      return NextResponse.json(
        { error: "Specify customerId to open an isolated tenant workspace.", code: "CUSTOMER_REQUIRED" },
        { status: 400 }
      );
    }
    const rows = platform.contacts.filter((c) => c.customerId === scopedCustomerId);
    return NextResponse.json({ contacts: rows, source: "local" });
  }

  if (joined === "domains") {
    if (!scopedCustomerId) {
      return NextResponse.json(
        { error: "Specify customerId to open an isolated tenant workspace.", code: "CUSTOMER_REQUIRED" },
        { status: 400 }
      );
    }
    const rows = platform.domains.filter((d) => d.customerId === scopedCustomerId);
    return NextResponse.json({ domains: rows, source: "local" });
  }

  if (joined === "service-health") {
    if (!scopedCustomerId) {
      return NextResponse.json(
        { error: "Specify customerId to open an isolated tenant workspace.", code: "CUSTOMER_REQUIRED" },
        { status: 400 }
      );
    }
    return NextResponse.json({
      services: platform.serviceHealth[scopedCustomerId] || [],
      source: "local",
    });
  }

  if (joined === "security") {
    if (!scopedCustomerId) {
      return NextResponse.json(
        { error: "Specify customerId to open an isolated tenant workspace.", code: "CUSTOMER_REQUIRED" },
        { status: 400 }
      );
    }
    return NextResponse.json({
      security: platform.security[scopedCustomerId] || null,
      source: "local",
    });
  }

  if (joined === "license-optimization") {
    if (!scopedCustomerId) {
      return NextResponse.json(
        { error: "Specify customerId to open an isolated tenant workspace.", code: "CUSTOMER_REQUIRED" },
        { status: 400 }
      );
    }
    return NextResponse.json({ ...licenseOptimization(scopedCustomerId), source: "local" });
  }

  if (joined === "billing/overview") {
    if (!scopedCustomerId) {
      return NextResponse.json(
        { error: "Specify customerId to open an isolated tenant workspace.", code: "CUSTOMER_REQUIRED" },
        { status: 400 }
      );
    }
    const { listTenantSubscriptions, getTenantCostSummary } = await import(
      "@/lib/subscription-store"
    );
    return NextResponse.json({
      cost: getTenantCostSummary(scopedCustomerId),
      subscriptions: listTenantSubscriptions(scopedCustomerId),
      invoices: (platform.invoices || []).filter((inv) => inv.customerId === scopedCustomerId),
      credits: [],
      source: "local",
    });
  }

  if (joined === "notifications") {
    const userId = session.accountId;
    const customerId = session.customerId;
    const inspect = activeInspect(session);
    const rows = platform.notifications.filter((n) => {
      if (n.userId && n.userId !== userId) return false;
      if (session.role === "partner_admin") {
        if (inspect) {
          return !n.customerId || n.customerId === inspect.customerId;
        }
        return true;
      }
      if (session.role === "customer_admin") {
        return Boolean(n.customerId && n.customerId === customerId);
      }
      return Boolean(n.userId && n.userId === userId);
    });
    return NextResponse.json({ notifications: rows, source: "local" });
  }

  if (joined === "notification-prefs") {
    const pref = platform.notificationPrefs.find((p) => p.userId === session.accountId) || {
      userId: session.accountId,
      renewals: ["email", "portal"],
      security: ["email", "portal"],
      invoices: ["email"],
      support: ["portal", "email"],
      incidents: ["portal"],
    };
    return NextResponse.json({ preferences: pref, source: "local" });
  }

  if (joined === "sessions") {
    const rows = platform.sessions.filter(
      (s) => s.userId === session.accountId && !s.revokedAt
    );
    return NextResponse.json({ sessions: rows, source: "local" });
  }

  if (joined === "pricing/compute") {
    const productId = url.searchParams.get("productId") || "";
    return NextResponse.json({
      price: computePrice(productId, scopedCustomerId),
      source: "local",
    });
  }

  if (joined === "break-glass") {
    return NextResponse.json({ emails: platform.breakGlassEmails, source: "local" });
  }

  if (joined === "admin-access") {
    const inspect = activeInspect(session);
    if (!inspect) {
      return NextResponse.json({ session: null, source: "local" });
    }
    const customer = findCustomer(inspect.customerId);
    return NextResponse.json({
      session: {
        customerId: inspect.customerId,
        customerName: inspect.customerName || customer?.name,
        reason: inspect.reason,
        readOnly: inspect.readOnly,
        expiresAt: new Date(inspect.exp * 1000).toISOString(),
        banner: `Viewing ${inspect.customerName || customer?.name || inspect.customerId} as Partner Administrator (read-only)`,
      },
      source: "local",
    });
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
  const access = await authorizeCspPath(request, joined);
  if ("error" in access) return access.error;
  if (joined !== "admin-access" && joined !== "admin-access/end") {
    const inspectBlocked = denyActiveInspectWrite(access.session);
    if (inspectBlocked) return inspectBlocked;
  }

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
    const res = NextResponse.json({
      session: {
        ...session,
        customerName: customer?.name,
        banner: `Viewing ${customer?.name || customerId} as Partner Administrator (read-only)`,
      },
      source: "local",
    });
    await applySessionCookie(res, {
      accountId: auth.session.accountId,
      name: auth.session.name,
      email: auth.session.email,
      role: auth.session.role,
      customerId: auth.session.customerId,
      customerName: auth.session.customerName,
      team: auth.session.team,
      title: auth.session.title,
      inspect: {
        customerId,
        customerName: customer?.name,
        reason,
        readOnly: session.readOnly,
        exp: Math.floor(Date.now() / 1000) + minutes * 60,
      },
    });
    return res;
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
    const result = createPlatformQuote({
      customerId: String(body.customerId || ""),
      currency: body.currency ? String(body.currency) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
      validUntil: body.validUntil ? String(body.validUntil) : undefined,
      createdBy: auth.session.email,
      items: Array.isArray(body.items) ? body.items : [],
    });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    const customer = findCustomer(result.quote.customerId);
    writeAudit({
      action: "commerce.quote",
      actorAccountId: auth.session.accountId,
      actorEmail: auth.session.email,
      actorRole: auth.session.role,
      customerId: result.quote.customerId,
      detail: `Generated quote ${result.quote.id} for ${customer?.name || result.quote.customerId} (${result.quote.items.length} line item(s))`,
      meta: { quoteId: result.quote.id },
      riskLevel: "low",
    });
    return NextResponse.json({ quote: result.quote, source: "local" });
  }

  if (joined === "invoices") {
    const auth = await requirePartnerAdmin(request);
    if ("error" in auth) return auth.error;
    const result = createPlatformInvoice({
      customerId: String(body.customerId || ""),
      currency: body.currency ? String(body.currency) : undefined,
      period: body.period ? String(body.period) : undefined,
      quoteId: body.quoteId ? String(body.quoteId) : undefined,
      orderId: body.orderId ? String(body.orderId) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
      dueAt: body.dueAt ? String(body.dueAt) : undefined,
      status: body.status || "draft",
      microsoftCost: body.microsoftCost != null ? Number(body.microsoftCost) : undefined,
      netrichMarkup: body.netrichMarkup != null ? Number(body.netrichMarkup) : undefined,
      taxRate: body.taxRate != null ? Number(body.taxRate) : undefined,
      tax: body.tax != null ? Number(body.tax) : undefined,
      createdBy: auth.session.email,
      items: Array.isArray(body.items) ? body.items : [],
    });
    if ("error" in result) {
      return NextResponse.json(result, { status: 400 });
    }
    writeAudit({
      action: "commerce.invoice",
      actorAccountId: auth.session.accountId,
      actorEmail: auth.session.email,
      actorRole: auth.session.role,
      customerId: result.invoice.customerId,
      detail: `Generated invoice ${result.invoice.id} for ${result.invoice.customerName} ($${result.invoice.total.toFixed(2)})`,
      meta: { invoiceId: result.invoice.id, total: result.invoice.total },
      riskLevel: "medium",
    });
    return NextResponse.json({ invoice: result.invoice, source: "local" });
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

  if (joined === "admin-access/end") {
    const auth = await requirePartnerAdmin(request);
    if ("error" in auth) return auth.error;
    const res = NextResponse.json({ ok: true, source: "local" });
    await applySessionCookie(res, {
      accountId: auth.session.accountId,
      name: auth.session.name,
      email: auth.session.email,
      role: auth.session.role,
      customerId: auth.session.customerId,
      customerName: auth.session.customerName,
      team: auth.session.team,
      title: auth.session.title,
    });
    return res;
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  const access = await authorizeCspPath(request, joined);
  if ("error" in access) return access.error;
  const inspectBlocked = denyActiveInspectWrite(access.session);
  if (inspectBlocked) return inspectBlocked;

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
    const sessionAuth = await requireSession(request);
    if ("error" in sessionAuth) return sessionAuth.error;
    const id = joined.split("/")[1];
    const n = platform.notifications.find((x) => x.id === id);
    if (!n) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const s = sessionAuth.session;
    if (n.userId && n.userId !== s.accountId) {
      return NextResponse.json({ error: "Forbidden", code: "TENANT_ISOLATION" }, { status: 403 });
    }
    if (s.role === "customer_admin") {
      if (!n.customerId || n.customerId !== s.customerId) {
        return NextResponse.json({ error: "Forbidden", code: "TENANT_ISOLATION" }, { status: 403 });
      }
    } else if (s.role !== "partner_admin" && n.userId !== s.accountId) {
      return NextResponse.json({ error: "Forbidden", code: "TENANT_ISOLATION" }, { status: 403 });
    }
    n.readAt = new Date().toISOString();
    savePlatform(platform);
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
    if (lifecycle === "TERMINATING" || lifecycle === "PURGED") {
      if (!body.approvalId) {
        const approval = {
          id: `apr-${Date.now().toString(36)}`,
          operation: "tenant.terminate",
          customerId: id,
          requesterEmail: partner.session.email,
          status: "pending" as const,
          payload: { action: "terminate", lifecycle },
          createdAt: new Date().toISOString(),
        };
        platform.approvals.unshift(approval);
        savePlatform(platform);
        writeAudit({
          action: "tenant.delete",
          actorAccountId: partner.session.accountId,
          actorEmail: partner.session.email,
          actorRole: partner.session.role,
          customerId: id,
          detail: `Termination approval requested via CSP lifecycle (${lifecycle})`,
          riskLevel: "critical",
          approvalId: approval.id,
          result: "pending",
        });
        return NextResponse.json(
          {
            ok: false,
            requiresApproval: true,
            approval,
            message: `Four-eyes approval required to set lifecycle ${lifecycle}.`,
            source: "local",
          },
          { status: 409 }
        );
      }
      const apr = platform.approvals.find((a) => a.id === String(body.approvalId));
      if (
        !apr ||
        apr.status !== "approved" ||
        apr.operation !== "tenant.terminate" ||
        apr.customerId !== id
      ) {
        return NextResponse.json(
          { error: "Valid approved termination approval required", code: "APPROVAL_REQUIRED" },
          { status: 400 }
        );
      }
      apr.status = "executed";
      savePlatform(platform);
    }
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
    writeAudit({
      action: "tenant.configure",
      actorAccountId: partner.session.accountId,
      actorEmail: partner.session.email,
      actorRole: partner.session.role,
      customerId: id,
      detail: `CSP lifecycle set to ${lifecycle}`,
      riskLevel: lifecycle === "ACTIVE" ? "medium" : "high",
    });
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
