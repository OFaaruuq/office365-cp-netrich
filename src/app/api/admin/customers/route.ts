import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_TENANT_CONFIG } from "@/lib/tenancy-data";
import type { ClientTenant, ClientTenantConfig, CustomerStatus } from "@/lib/tenancy-types";
import {
  findCustomer,
  loadCustomers,
  normalizeCustomer,
  saveCustomers,
} from "@/lib/customer-store";
import { requirePartnerAdmin } from "@/lib/auth/guards";
import { listAudit, writeAudit } from "@/lib/audit-log";

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
  const customers = loadCustomers();
  const now = new Date().toISOString();

  const config: ClientTenantConfig = {
    ...DEFAULT_TENANT_CONFIG,
    ...(body.config || {}),
    billingContactEmail: body.billingContactEmail || body.adminEmail || "",
    technicalContactEmail: body.technicalContactEmail || body.adminEmail || "",
    portalAccessEnabled: false,
    syncEnabled: false,
  };

  const customer: ClientTenant = {
    id: `cust-${Date.now().toString(36)}`,
    name: body.name,
    domain: body.domain,
    microsoftTenantId: body.microsoftTenantId || crypto.randomUUID(),
    status: "pending",
    adminEmail: body.adminEmail,
    usersCount: 0,
    subscriptionsCount: 0,
    monthlySpend: 0,
    createdAt: now,
    lastSyncAt: now,
    createdByPartner: true,
    config,
  };

  customers.unshift(customer);
  saveCustomers(customers);
  writeAudit({
    action: "tenant.create",
    actorAccountId: auth.session.accountId,
    actorEmail: auth.session.email,
    actorRole: auth.session.role,
    customerId: customer.id,
    detail: `Created pending tenant ${customer.name}`,
  });
  return NextResponse.json({
    customer,
    message: `Client tenant created by Super Admin (${actor}). Status is pending until approved & configured. Tenant data is isolated from all other clients.`,
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
