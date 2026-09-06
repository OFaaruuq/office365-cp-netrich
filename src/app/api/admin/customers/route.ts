import {
  deleteClientAdminsForCustomer,
  upsertClientAdminAccount,
} from "@/lib/account-store";
import {
  deleteCustomer,
  findCustomer,
  loadCustomers,
  normalizeCustomer,
  saveCustomers,
} from "@/lib/customer-store";
import { clearAccountPassword } from "@/lib/auth/password-store";
import { resetMfa } from "@/lib/auth/mfa";
import { deleteTenantSubscriptions } from "@/lib/subscription-store";
import { requirePartnerAdmin } from "@/lib/auth/guards";
import { listAudit, writeAudit } from "@/lib/audit-log";
import { DEFAULT_TENANT_CONFIG } from "@/lib/tenancy-data";
import type { ClientTenant, ClientTenantConfig, CustomerStatus } from "@/lib/tenancy-types";
import { NextRequest, NextResponse } from "next/server";

const CATALOG_IDS = ["microsoft-365", "dynamics-365", "azure", "server-software"] as const;

function parseAllowedCatalogs(raw: unknown): ClientTenantConfig["allowedCatalogs"] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...DEFAULT_TENANT_CONFIG.allowedCatalogs];
  }
  const allowed = raw.filter((id): id is (typeof CATALOG_IDS)[number] =>
    CATALOG_IDS.includes(id as (typeof CATALOG_IDS)[number])
  );
  return allowed.length ? allowed : [...DEFAULT_TENANT_CONFIG.allowedCatalogs];
}

export async function GET(request: NextRequest) {
  const auth = await requirePartnerAdmin(request);
  if ("error" in auth) return auth.error;

  const id = new URL(request.url).searchParams.get("id");
  const customers = loadCustomers();
  if (id) {
    const customer = customers.find((c) => c.id === id);
    if (!customer) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      customer,
      audit: listAudit({ customerId: id, limit: 25 }),
    });
  }
  return NextResponse.json({
    customers,
    summary: {
      total: customers.length,
      active: customers.filter((c) => c.status === "active").length,
      pending: customers.filter((c) => c.status === "pending").length,
      suspended: customers.filter((c) => c.status === "suspended").length,
      rejected: customers.filter((c) => c.status === "rejected").length,
    },
    policy: {
      clientSelfSignup: false,
      onlySuperAdminCreates: true,
      onlySuperAdminApproves: true,
      tenantIsolation: "hard",
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requirePartnerAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const actor = auth.session.email;
  const name = String(body.name || "").trim();
  const domain = String(body.domain || "").trim().toLowerCase();
  const adminEmail = String(body.adminEmail || "").trim().toLowerCase();
  const microsoftTenantId = String(body.microsoftTenantId || "").trim();

  if (!name || !domain || !adminEmail) {
    return NextResponse.json(
      { error: "Company name, Microsoft domain, and client admin email are required." },
      { status: 400 }
    );
  }
  if (!adminEmail.includes("@")) {
    return NextResponse.json({ error: "Client admin email is invalid." }, { status: 400 });
  }

  const customers = loadCustomers();
  if (customers.some((c) => c.domain.toLowerCase() === domain)) {
    return NextResponse.json(
      { error: "A tenant with this Microsoft domain already exists.", code: "DOMAIN_EXISTS" },
      { status: 409 }
    );
  }
  if (customers.some((c) => c.adminEmail.toLowerCase() === adminEmail)) {
    return NextResponse.json(
      { error: "A tenant with this admin email already exists.", code: "EMAIL_EXISTS" },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const approveImmediately = Boolean(body.approveImmediately);
  const allowedCatalogs = parseAllowedCatalogs(body.allowedCatalogs ?? body.config?.allowedCatalogs);

  const config: ClientTenantConfig = {
    ...DEFAULT_TENANT_CONFIG,
    ...(body.config || {}),
    allowedCatalogs,
    billingContactEmail: String(
      body.billingContactEmail || body.config?.billingContactEmail || adminEmail
    ).trim(),
    technicalContactEmail: String(
      body.technicalContactEmail || body.config?.technicalContactEmail || adminEmail
    ).trim(),
    notes: String(body.notes || body.config?.notes || "").trim(),
    gdapEnabled: Boolean(body.gdapEnabled ?? body.config?.gdapEnabled ?? approveImmediately),
    syncEnabled: Boolean(body.syncEnabled ?? body.config?.syncEnabled ?? approveImmediately),
    portalAccessEnabled: approveImmediately,
  };

  const customer: ClientTenant = {
    id: `cust-${Date.now().toString(36)}`,
    name,
    domain,
    microsoftTenantId: microsoftTenantId || crypto.randomUUID(),
    status: approveImmediately ? "active" : "pending",
    adminEmail,
    usersCount: 0,
    subscriptionsCount: 0,
    monthlySpend: 0,
    createdAt: now,
    lastSyncAt: now,
    createdByPartner: true,
    configuredAt: now,
    approvedAt: approveImmediately ? now : undefined,
    approvedBy: approveImmediately ? actor : undefined,
    config,
  };

  customers.unshift(normalizeCustomer(customer));
  saveCustomers(customers);

  const clientAccount = upsertClientAdminAccount({
    customerId: customer.id,
    name: `${name} Admin`,
    email: adminEmail,
  });

  writeAudit({
    action: "tenant.create",
    actorAccountId: auth.session.accountId,
    actorEmail: auth.session.email,
    actorRole: auth.session.role,
    customerId: customer.id,
    detail: approveImmediately
      ? `Created and approved tenant ${customer.name}`
      : `Created pending tenant ${customer.name}`,
    meta: {
      approveImmediately,
      catalogs: config.allowedCatalogs.join(","),
      clientAccountId: clientAccount.id,
    },
  });

  if (approveImmediately) {
    writeAudit({
      action: "tenant.approve",
      actorAccountId: auth.session.accountId,
      actorEmail: auth.session.email,
      actorRole: auth.session.role,
      customerId: customer.id,
      detail: `Portal enabled for ${adminEmail}`,
    });
  }

  return NextResponse.json({
    customer: customers[0],
    clientAccount: {
      id: clientAccount.id,
      email: clientAccount.email,
      name: clientAccount.name,
    },
    message: approveImmediately
      ? `Tenant created and approved. Client admin ${adminEmail} can sign in.`
      : `Tenant created as pending. Configure features, then approve to enable portal access.`,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePartnerAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const actor = auth.session.email;
  const customers = loadCustomers();
  const idx = customers.findIndex((c) => c.id === body.id);
  if (idx < 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const current = customers[idx];
  const now = new Date().toISOString();
  const action = body.action as string | undefined;

  if (action === "delete" || action === "terminate") {
    // Soft terminate requires four-eyes approval unless approvalId provided or force purge
    if (!body.force && !body.approvalId && !body.skipApproval) {
      const { loadPlatform, savePlatform } = await import("@/lib/platform-store");
      const platform = loadPlatform();
      const approval = {
        id: `apr-${Date.now().toString(36)}`,
        operation: "tenant.terminate",
        customerId: current.id,
        requesterEmail: auth.session.email,
        status: "pending" as const,
        payload: { action: "terminate" },
        createdAt: new Date().toISOString(),
      };
      platform.approvals.unshift(approval);
      savePlatform(platform);
      writeAudit({
        action: "tenant.delete",
        actorAccountId: auth.session.accountId,
        actorEmail: auth.session.email,
        actorRole: auth.session.role,
        customerId: current.id,
        detail: `Termination approval requested for ${current.name}`,
        riskLevel: "critical",
        approvalId: approval.id,
        result: "pending",
      });
      return NextResponse.json({
        ok: false,
        requiresApproval: true,
        approval,
        message: `Four-eyes approval required to terminate "${current.name}". Another Super Admin must approve in Approvals, then retry with approvalId.`,
      });
    }
    if (body.approvalId && !body.force) {
      const { loadPlatform, savePlatform } = await import("@/lib/platform-store");
      const platform = loadPlatform();
      const apr = platform.approvals.find((a) => a.id === body.approvalId);
      if (!apr || apr.status !== "approved" || apr.operation !== "tenant.terminate") {
        return NextResponse.json(
          { error: "Valid approved termination approval required", code: "APPROVAL_REQUIRED" },
          { status: 400 }
        );
      }
      apr.status = "executed";
      savePlatform(platform);
    }
    // Soft terminate by default (compliance retention). Pass force=true to hard-purge demo data.
    if (!body.force) {
      const terminating: ClientTenant = {
        ...current,
        status: "suspended",
        lifecycle: "TERMINATING",
        config: { ...current.config, portalAccessEnabled: false, syncEnabled: false },
      };
      customers[idx] = normalizeCustomer(terminating);
      saveCustomers(customers);
      writeAudit({
        action: "tenant.delete",
        actorAccountId: auth.session.accountId,
        actorEmail: auth.session.email,
        actorRole: auth.session.role,
        customerId: current.id,
        detail: `Tenant ${current.name} marked TERMINATING (portal locked; retention). Use force=true to purge.`,
        meta: { lifecycle: "TERMINATING" },
      });
      return NextResponse.json({
        ok: true,
        deleted: false,
        terminating: true,
        customer: customers[idx],
        message: `Tenant "${current.name}" entered TERMINATING lifecycle. Portal locked; records retained for audit/billing.`,
      });
    }

    const removedAdmins = deleteClientAdminsForCustomer(current.id);
    for (const a of removedAdmins) {
      resetMfa(a.id);
      clearAccountPassword(a.id);
    }
    const subsRemoved = deleteTenantSubscriptions(current.id);
    const deleted = deleteCustomer(current.id);
    if ("error" in deleted) {
      return NextResponse.json(deleted, { status: 404 });
    }
    writeAudit({
      action: "tenant.delete",
      actorAccountId: auth.session.accountId,
      actorEmail: auth.session.email,
      actorRole: auth.session.role,
      customerId: current.id,
      detail: `Hard-purged tenant ${current.name} (${removedAdmins.length} client admins, ${subsRemoved} subscriptions)`,
      meta: {
        name: current.name,
        adminsRemoved: removedAdmins.length,
        subscriptionsRemoved: subsRemoved,
        lifecycle: "PURGED",
      },
    });
    return NextResponse.json({
      ok: true,
      deleted: true,
      customer: { ...deleted.customer, lifecycle: "PURGED" },
      message: `Tenant "${current.name}" purged.`,
    });
  }

  let next: ClientTenant = { ...current };

  if (action === "approve") {
    const configured =
      current.config.gdapEnabled &&
      current.config.syncEnabled &&
      Boolean(current.config.billingContactEmail);
    if (!configured && !body.force) {
      return NextResponse.json(
        {
          error:
            "Configure the tenant first (GDAP, sync, billing contact), then approve. Or pass force=true.",
          code: "NOT_CONFIGURED",
        },
        { status: 400 }
      );
    }
    next = {
      ...current,
      status: "active",
      approvedAt: now,
      approvedBy: actor,
      configuredAt: current.configuredAt || now,
      config: {
        ...current.config,
        portalAccessEnabled: true,
        syncEnabled: true,
        gdapEnabled: true,
        billingContactEmail: current.config.billingContactEmail || current.adminEmail,
        technicalContactEmail: current.config.technicalContactEmail || current.adminEmail,
        ...(body.config || {}),
      },
    };
  } else if (action === "reject") {
    next = {
      ...current,
      status: "rejected",
      config: { ...current.config, portalAccessEnabled: false, syncEnabled: false },
    };
  } else if (action === "suspend") {
    next = {
      ...current,
      status: "suspended",
      config: { ...current.config, portalAccessEnabled: false },
    };
  } else if (action === "configure") {
    const catalogs =
      body.config?.allowedCatalogs != null
        ? parseAllowedCatalogs(body.config.allowedCatalogs)
        : current.config.allowedCatalogs;
    next = {
      ...current,
      name: body.name ?? current.name,
      domain: body.domain ?? current.domain,
      adminEmail: body.adminEmail ?? current.adminEmail,
      microsoftTenantId: body.microsoftTenantId ?? current.microsoftTenantId,
      configuredAt: now,
      config: {
        ...current.config,
        ...(body.config || {}),
        allowedCatalogs: catalogs,
      },
    };
  } else if (action === "set_status") {
    next = {
      ...current,
      status: body.status as CustomerStatus,
      config: {
        ...current.config,
        portalAccessEnabled: body.status === "active",
      },
    };
  } else {
    next = {
      ...current,
      ...("name" in body ? { name: body.name } : {}),
      ...("domain" in body ? { domain: body.domain } : {}),
      ...("adminEmail" in body ? { adminEmail: body.adminEmail } : {}),
      ...("status" in body ? { status: body.status } : {}),
      ...("microsoftTenantId" in body
        ? { microsoftTenantId: body.microsoftTenantId }
        : {}),
      config: body.config ? { ...current.config, ...body.config } : current.config,
    };
  }

  customers[idx] = normalizeCustomer(next);
  saveCustomers(customers);

  // Keep client-admin login in sync when identity changes
  upsertClientAdminAccount({
    customerId: customers[idx].id,
    name: `${customers[idx].name} Admin`,
    email: customers[idx].adminEmail,
  });

  const auditAction =
    action === "approve"
      ? "tenant.approve"
      : action === "reject"
        ? "tenant.reject"
        : action === "suspend"
          ? "tenant.suspend"
          : action === "configure"
            ? "tenant.configure"
            : "tenant.configure";

  writeAudit({
    action: auditAction,
    actorAccountId: auth.session.accountId,
    actorEmail: auth.session.email,
    actorRole: auth.session.role,
    customerId: next.id,
    detail: `Super Admin ${action || "update"} → status=${customers[idx].status}`,
  });

  return NextResponse.json({ customer: customers[idx], action: action || "update" });
}

/** Ensure tenant exists helper for other modules */
export function getLiveCustomer(id: string) {
  return findCustomer(id);
}
