import { Body, Controller, Get, Post, Query, ConflictException, NotFoundException } from "@nestjs/common";
import { withTenantContext } from "../../../libs/prisma";
import {
  CurrentTenant,
  RequirePermissions,
  assertCustomerAccess,
  isPartnerRole,
  type TenantContext,
} from "../../../libs/guards";
import { acquireGraphToken, syncDirectoryGroups, syncDirectoryUsers } from "../../../libs/graph-client";

@Controller("directory")
export class DirectoryController {
  @RequirePermissions("user.read")
  @Get("users")
  async users(@CurrentTenant() tenant: TenantContext, @Query("customerId") customerId?: string) {
    const id = isPartnerRole(tenant.role) ? customerId || tenant.customerId : tenant.customerId;
    if (!id) throw new NotFoundException({ code: "CUSTOMER_REQUIRED" });
    return withTenantContext(tenant, async (tx) => {
      const customer = await tx.customer.findFirst({ where: { OR: [{ id }, { legacyId: id }] } });
      if (!customer) throw new NotFoundException({ code: "NOT_FOUND" });
      assertCustomerAccess(tenant, customer);
      const users = await tx.directoryUser.findMany({ where: { customerId: customer.id }, orderBy: { displayName: "asc" } });
      return { users, source: "postgres" };
    });
  }

  @RequirePermissions("user.read")
  @Get("groups")
  async groups(@CurrentTenant() tenant: TenantContext, @Query("customerId") customerId?: string) {
    const id = isPartnerRole(tenant.role) ? customerId || tenant.customerId : tenant.customerId;
    if (!id) throw new NotFoundException({ code: "CUSTOMER_REQUIRED" });
    return withTenantContext(tenant, async (tx) => {
      const customer = await tx.customer.findFirst({ where: { OR: [{ id }, { legacyId: id }] } });
      if (!customer) throw new NotFoundException({ code: "NOT_FOUND" });
      assertCustomerAccess(tenant, customer);
      const groups = await tx.directoryGroup.findMany({ where: { customerId: customer.id } });
      return { groups, source: "postgres" };
    });
  }

  @RequirePermissions("user.read")
  @Post("sync")
  async sync(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { customerId?: string; entraTenantId?: string }
  ) {
    const id = isPartnerRole(tenant.role) ? body.customerId || tenant.customerId : tenant.customerId;
    if (!id) throw new NotFoundException({ code: "CUSTOMER_REQUIRED" });
    return withTenantContext(tenant, async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { OR: [{ id }, { legacyId: id }] },
        include: { microsoftTenants: true },
      });
      if (!customer) throw new NotFoundException({ code: "NOT_FOUND" });
      assertCustomerAccess(tenant, customer);
      const entra =
        customer.microsoftTenants.find((t) => t.isPrimary)?.entraTenantId ||
        customer.microsoftTenants[0]?.entraTenantId;
      if (body.entraTenantId && body.entraTenantId !== entra) {
        throw new ConflictException({
          code: "TENANT_ISOLATION",
          message: "entraTenantId does not match this customer's Microsoft tenant.",
        });
      }
      if (!entra) {
        throw new ConflictException({
          code: "GRAPH_NOT_CONFIGURED",
          message: "This customer has no Microsoft tenant id; Graph sync refused.",
        });
      }
      const token = await acquireGraphToken(entra);
      if (!token.ok) {
        throw new ConflictException({ code: token.code, message: token.message });
      }
      const users = await syncDirectoryUsers(token.accessToken);
      let groups: Awaited<ReturnType<typeof syncDirectoryGroups>> = [];
      try {
        groups = await syncDirectoryGroups(token.accessToken);
      } catch {
        groups = [];
      }
      for (const u of users) {
        await tx.directoryUser.upsert({
          where: { customerId_email: { customerId: customer.id, email: u.email } },
          create: {
            customerId: customer.id,
            graphUserId: u.id,
            displayName: u.displayName,
            email: u.email,
            status: u.status,
            licenses: u.licenses,
            syncedFromGraph: true,
            lastSyncedAt: new Date(),
          },
          update: {
            graphUserId: u.id,
            displayName: u.displayName,
            status: u.status,
            licenses: u.licenses,
            syncedFromGraph: true,
            lastSyncedAt: new Date(),
          },
        });
      }
      await tx.directoryGroup.deleteMany({ where: { customerId: customer.id, source: "graph" } });
      for (const g of groups) {
        await tx.directoryGroup.create({
          data: {
            customerId: customer.id,
            graphId: g.id,
            name: g.name,
            type: g.type,
            members: g.members,
            source: "graph",
          },
        });
      }
      await tx.graphSyncState.upsert({
        where: {
          customerId_entraTenantId_resource: {
            customerId: customer.id,
            entraTenantId: entra || "unknown",
            resource: "users",
          },
        },
        create: {
          customerId: customer.id,
          entraTenantId: entra || "unknown",
          resource: "users",
          lastDeltaSync: new Date(),
          status: "ok",
        },
        update: { lastDeltaSync: new Date(), status: "ok" },
      });
      return { users, groups, source: "graph" };
    });
  }
}
