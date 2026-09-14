import { PrismaClient } from "@prisma/client";
import { PERMISSIONS, ROLE_PACKS } from "../libs/rbac";

const prisma = new PrismaClient();

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

  console.log("Seed complete. Partner:", partner.slug);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
