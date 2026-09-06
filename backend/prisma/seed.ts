import { PrismaClient, OnboardingStepKey } from "@prisma/client";
import { PERMISSIONS, ROLE_PACKS } from "../libs/rbac";

const prisma = new PrismaClient();

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

  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { description: p.description },
      create: { key: p.key, description: p.description },
    });
  }

  for (const pack of ROLE_PACKS) {
    const role = await prisma.role.upsert({
      where: { key: pack.key },
      update: { name: pack.name, scope: pack.scope, description: pack.name },
      create: {
        key: pack.key,
        name: pack.name,
        scope: pack.scope,
        description: pack.name,
      },
    });
    for (const permKey of pack.permissions) {
      const perm = await prisma.permission.findUnique({ where: { key: permKey } });
      if (!perm) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: perm.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }

  const flags = [
    { key: "partner_control_center", description: "New Partner Control Center nav", enabledGlobal: true },
    { key: "customer_nav_v2", description: "Customer portal nav v2", enabledGlobal: true },
    { key: "azure_management", description: "Azure CSP management", enabledGlobal: false },
    { key: "security_center", description: "Expanded security center", enabledGlobal: true },
    { key: "license_optimizer", description: "License optimization", enabledGlobal: false },
    { key: "new_checkout", description: "NCE checkout", enabledGlobal: false },
    { key: "support_v2", description: "SLA support", enabledGlobal: false },
    { key: "ai_recommendations", description: "AI recommendations", enabledGlobal: false },
  ];
  for (const f of flags) {
    await prisma.featureFlag.upsert({
      where: { key: f.key },
      update: { description: f.description, enabledGlobal: f.enabledGlobal },
      create: {
        key: f.key,
        description: f.description,
        enabledGlobal: f.enabledGlobal,
        environments: ["development", "staging", "production"],
      },
    });
  }

  const health = [
    "postgres",
    "redis",
    "api",
    "workers",
    "partner_center",
    "microsoft_graph",
    "email",
  ];
  for (const component of health) {
    await prisma.integrationHealth.upsert({
      where: { component },
      update: {
        status: ["postgres", "api"].includes(component) ? "healthy" : "not_configured",
        lastCheckedAt: new Date(),
      },
      create: {
        component,
        status: ["postgres", "api"].includes(component) ? "healthy" : "not_configured",
      },
    });
  }

  // Demo customer with GDAP + onboarding if none exist
  const existing = await prisma.customer.count();
  if (existing === 0) {
    const customer = await prisma.customer.create({
      data: {
        partnerId: partner.id,
        name: "Demo Customer",
        domain: "demo.example.com",
        status: "pending",
        adminEmail: "admin@demo.example.com",
        allowedCatalogs: ["microsoft-365"],
        legacyId: "cust-demo",
        microsoftTenants: {
          create: {
            entraTenantId: "00000000-0000-0000-0000-000000000001",
            displayName: "Demo Customer",
            defaultDomain: "demo.example.com",
            isPrimary: true,
            domains: {
              create: {
                name: "demo.example.com",
                isVerified: true,
                isPrimary: true,
              },
            },
          },
        },
        contacts: {
          create: [
            { type: "PRIMARY", email: "admin@demo.example.com", name: "Demo Admin" },
            { type: "BILLING", email: "billing@demo.example.com" },
            { type: "TECHNICAL", email: "tech@demo.example.com" },
          ],
        },
      },
    });

    for (const step of ALL_STEPS) {
      const completed = step === "customer_created" || step === "microsoft_tenant_identified";
      await prisma.onboardingStep.create({
        data: {
          customerId: customer.id,
          stepKey: step,
          completed,
          completedAt: completed ? new Date() : null,
        },
      });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 97);
    await prisma.gdapRelationship.create({
      data: {
        customerId: customer.id,
        microsoftRelationshipId: "GDAP-DEMO-001",
        displayName: "Netrich ↔ Demo Customer",
        status: "active",
        activatedAt: new Date(),
        expiresAt,
        durationDays: 180,
        roles: {
          create: [
            { roleDefinitionId: "fe930be7-5e62-47db-91af-98c3a49a38b1", roleName: "User Administrator" },
            { roleDefinitionId: "4d6ac14f-3453-41d6-8982-aa0a9165608b", roleName: "License Administrator" },
            { roleDefinitionId: "f023fd81-a637-4b56-95fd-791ac713ca11", roleName: "Service Support Administrator" },
            { roleDefinitionId: "729827e3-9c14-49f7-bb12-fa0d8e4c4a6a", roleName: "Helpdesk Administrator" },
          ],
        },
        events: {
          create: {
            event: "activated",
            oldStatus: "pending_acceptance",
            newStatus: "active",
          },
        },
      },
    });

    const superRole = await prisma.role.findUnique({ where: { key: "platform_super_admin" } });
    const admin = await prisma.portalUser.upsert({
      where: { email: "admin@netrichtechnologies.com" },
      update: {},
      create: {
        partnerId: partner.id,
        email: "admin@netrichtechnologies.com",
        name: "Netrich Super Admin",
        title: "Super Administrator",
        legacyRole: "partner_admin",
        legacyId: "acc-partner-admin",
      },
    });
    if (superRole) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: admin.id, roleId: superRole.id } },
        update: {},
        create: { userId: admin.id, roleId: superRole.id },
      });
    }
  }

  console.log("Seed complete. Partner:", partner.slug);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
