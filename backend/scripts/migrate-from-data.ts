/**
 * Import Next.js .data/*.json into PostgreSQL (Phase 1 bridge).
 * Run from backend/: npm run migrate:from-data
 */
import { readFileSync, existsSync } from "fs";
import path from "path";
import { PrismaClient, OnboardingStepKey, CustomerStatus } from "@prisma/client";
import { LEGACY_ROLE_MAP } from "../libs/rbac";

const prisma = new PrismaClient();
const DATA = path.join(process.cwd(), "..", ".data");

function readJson<T>(name: string): T | null {
  const file = path.join(DATA, name);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

const ALL_STEPS: OnboardingStepKey[] = [
  "customer_created",
  "microsoft_tenant_identified",
  "csp_relationship",
  "gdap_relationship",
  "customer_accepted",
  "application_consent",
  "permissions_verified",
  "graph_sync",
  "partner_center_sync",
  "pricing_configured",
  "client_admin_created",
  "portal_activated",
];

type LegacyCustomer = {
  id: string;
  name: string;
  domain: string;
  microsoftTenantId: string;
  status: string;
  adminEmail: string;
  usersCount?: number;
  subscriptionsCount?: number;
  monthlySpend?: number;
  approvedAt?: string;
  approvedBy?: string;
  configuredAt?: string;
  config?: {
    portalAccessEnabled?: boolean;
    syncEnabled?: boolean;
    gdapEnabled?: boolean;
    allowedCatalogs?: string[];
    billingContactEmail?: string;
    technicalContactEmail?: string;
    notes?: string;
  };
};

type LegacyAccount = {
  id: string;
  name: string;
  email: string;
  role: string;
  customerId?: string;
  title?: string;
  disabled?: boolean;
  deleted?: boolean;
};

type LegacyAudit = {
  action: string;
  actorEmail?: string;
  actorRole?: string;
  customerId?: string;
  detail?: string;
  at?: string;
};

async function main() {
  const partner = await prisma.partner.upsert({
    where: { slug: "netrichtechnologies" },
    update: {},
    create: {
      name: "netrichtechnologies",
      slug: "netrichtechnologies",
      domain: "netrichtechnologies.com",
    },
  });

  const customers = readJson<LegacyCustomer[]>("customers.json") || [];
  console.log(`Importing ${customers.length} customers from .data`);

  for (const c of customers) {
    const status = (["pending", "active", "suspended", "rejected"].includes(c.status)
      ? c.status
      : "pending") as CustomerStatus;
    const lifecycle =
      status === "suspended" ? "SUSPENDED" : status === "rejected" ? "TERMINATING" : "ACTIVE";

    const row = await prisma.customer.upsert({
      where: { legacyId: c.id },
      update: {
        name: c.name,
        domain: c.domain,
        status,
        lifecycle: lifecycle as never,
        adminEmail: c.adminEmail,
        usersCount: c.usersCount || 0,
        subscriptionsCount: c.subscriptionsCount || 0,
        monthlySpend: c.monthlySpend || 0,
        portalAccessEnabled: !!c.config?.portalAccessEnabled,
        syncEnabled: !!c.config?.syncEnabled,
        gdapEnabled: !!c.config?.gdapEnabled,
        allowedCatalogs: c.config?.allowedCatalogs || ["microsoft-365"],
        notes: c.config?.notes || "",
      },
      create: {
        partnerId: partner.id,
        legacyId: c.id,
        name: c.name,
        domain: c.domain,
        status,
        lifecycle: lifecycle as never,
        adminEmail: c.adminEmail,
        usersCount: c.usersCount || 0,
        subscriptionsCount: c.subscriptionsCount || 0,
        monthlySpend: c.monthlySpend || 0,
        portalAccessEnabled: !!c.config?.portalAccessEnabled,
        syncEnabled: !!c.config?.syncEnabled,
        gdapEnabled: !!c.config?.gdapEnabled,
        allowedCatalogs: c.config?.allowedCatalogs || ["microsoft-365"],
        notes: c.config?.notes || "",
        approvedAt: c.approvedAt ? new Date(c.approvedAt) : null,
        approvedBy: c.approvedBy,
        configuredAt: c.configuredAt ? new Date(c.configuredAt) : null,
      },
    });

    if (c.microsoftTenantId) {
      await prisma.microsoftTenant.upsert({
        where: {
          customerId_entraTenantId: {
            customerId: row.id,
            entraTenantId: c.microsoftTenantId,
          },
        },
        update: { defaultDomain: c.domain, displayName: c.name },
        create: {
          customerId: row.id,
          entraTenantId: c.microsoftTenantId,
          displayName: c.name,
          defaultDomain: c.domain,
          isPrimary: true,
        },
      });
    }

    const contacts = [
      { type: "PRIMARY", email: c.adminEmail },
      { type: "BILLING", email: c.config?.billingContactEmail || c.adminEmail },
      { type: "TECHNICAL", email: c.config?.technicalContactEmail || c.adminEmail },
    ];
    for (const ct of contacts) {
      const exists = await prisma.customerContact.findFirst({
        where: { customerId: row.id, type: ct.type, email: ct.email },
      });
      if (!exists) {
        await prisma.customerContact.create({
          data: { customerId: row.id, type: ct.type, email: ct.email },
        });
      }
    }

    for (const step of ALL_STEPS) {
      let completed = step === "customer_created";
      if (c.microsoftTenantId && step === "microsoft_tenant_identified") completed = true;
      if (c.config?.gdapEnabled && step === "gdap_relationship") completed = true;
      if (c.config?.syncEnabled && step === "graph_sync") completed = true;
      if (status === "active" && step === "portal_activated") completed = true;
      if (c.config?.portalAccessEnabled && step === "client_admin_created") completed = true;
      await prisma.onboardingStep.upsert({
        where: {
          customerId_stepKey: { customerId: row.id, stepKey: step },
        },
        update: { completed, completedAt: completed ? new Date() : null },
        create: {
          customerId: row.id,
          stepKey: step,
          completed,
          completedAt: completed ? new Date() : null,
        },
      });
    }

    if (c.config?.gdapEnabled) {
      const existingGdap = await prisma.gdapRelationship.findFirst({
        where: { customerId: row.id },
      });
      if (!existingGdap) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 90);
        await prisma.gdapRelationship.create({
          data: {
            customerId: row.id,
            microsoftRelationshipId: `GDAP-${c.id}`,
            displayName: `Netrich ↔ ${c.name}`,
            status: "active",
            activatedAt: new Date(),
            expiresAt,
            durationDays: 180,
            roles: {
              create: [
                {
                  roleDefinitionId: "fe930be7-5e62-47db-91af-98c3a49a38b1",
                  roleName: "User Administrator",
                },
                {
                  roleDefinitionId: "4d6ac14f-3453-41d6-8982-aa0a9165608b",
                  roleName: "License Administrator",
                },
              ],
            },
          },
        });
      }
    }
  }

  const accounts = readJson<LegacyAccount[]>("portal-accounts.json") || [];
  // Also seed from tenancy if empty — accounts file may only have overrides
  console.log(`Importing ${accounts.length} portal account overrides`);
  for (const a of accounts) {
    let customerUuid: string | undefined;
    if (a.customerId) {
      const cust = await prisma.customer.findUnique({ where: { legacyId: a.customerId } });
      customerUuid = cust?.id;
    }
    const user = await prisma.portalUser.upsert({
      where: { email: a.email.toLowerCase() },
      update: {
        name: a.name,
        title: a.title || "",
        legacyRole: a.role,
        disabled: !!a.disabled,
        deleted: !!a.deleted,
        customerId: customerUuid,
        partnerId: a.role === "partner_admin" || a.role?.startsWith("support") ? partner.id : undefined,
        legacyId: a.id,
      },
      create: {
        email: a.email.toLowerCase(),
        name: a.name,
        title: a.title || "",
        legacyRole: a.role,
        disabled: !!a.disabled,
        deleted: !!a.deleted,
        customerId: customerUuid,
        partnerId: a.role === "partner_admin" || a.role?.startsWith("support") ? partner.id : undefined,
        legacyId: a.id,
      },
    });
    const packKey = LEGACY_ROLE_MAP[a.role];
    if (packKey) {
      const role = await prisma.role.findUnique({ where: { key: packKey } });
      if (role) {
        await prisma.userRole.upsert({
          where: { userId_roleId: { userId: user.id, roleId: role.id } },
          update: {},
          create: { userId: user.id, roleId: role.id },
        });
      }
    }
  }

  const audit = readJson<LegacyAudit[]>("audit-log.json") || [];
  let importedAudit = 0;
  for (const e of audit.slice(0, 500)) {
    let targetCustomerId: string | undefined;
    if (e.customerId) {
      const cust = await prisma.customer.findUnique({ where: { legacyId: e.customerId } });
      targetCustomerId = cust?.id;
    }
    await prisma.auditEvent.create({
      data: {
        at: e.at ? new Date(e.at) : new Date(),
        action: e.action,
        actorType: "user",
        actorEmail: e.actorEmail,
        actorRole: e.actorRole,
        targetCustomerId,
        detail: e.detail,
        riskLevel: "low",
        result: "ok",
      },
    });
    importedAudit++;
  }

  console.log(`Done. Customers=${customers.length}, accounts=${accounts.length}, audit=${importedAudit}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
