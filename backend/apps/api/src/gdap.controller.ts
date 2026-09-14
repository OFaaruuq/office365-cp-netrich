import { Body, Controller, Get, Param, Patch, Post, Query, NotFoundException } from "@nestjs/common";
import { withTenantContext } from "../../../libs/prisma";
import { CurrentTenant, RequirePartnerAdmin, RequirePermissions, type TenantContext } from "../../../libs/guards";
import { formatGdap } from "./customers.controller";

@RequirePartnerAdmin()
@Controller("gdap")
export class GdapController {
  @RequirePermissions("gdap.read")
  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query("expiringWithinDays") expiringWithinDays?: string
  ) {
    return withTenantContext(tenant, async (tx) => {
      const days = expiringWithinDays ? Number(expiringWithinDays) : undefined;
      const relationships = await tx.gdapRelationship.findMany({
        include: {
          roles: true,
          customer: { select: { id: true, name: true, domain: true } },
        },
        orderBy: { expiresAt: "asc" },
      });
      let rows = relationships.map((r) => ({
        ...formatGdap(r),
        customer: r.customer,
      }));
      if (days != null && !Number.isNaN(days)) {
        rows = rows.filter(
          (r) => r.remainingDays != null && r.remainingDays >= 0 && r.remainingDays <= days
        );
      }
      return { relationships: rows };
    });
  }

  @RequirePermissions("gdap.manage")
  @Post(":id/renew")
  async renew(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return withTenantContext(tenant, async (tx) => {
      const existing = await tx.gdapRelationship.findUnique({ where: { id }, include: { roles: true } });
      if (!existing) throw new NotFoundException({ code: "NOT_FOUND" });
      const expires = new Date();
      expires.setDate(expires.getDate() + (existing.durationDays || 180));
      const updated = await tx.gdapRelationship.update({
        where: { id },
        data: { expiresAt: expires, status: "active", lastSyncAt: new Date() },
        include: { roles: true, customer: { select: { id: true, name: true, domain: true } } },
      });
      await tx.gdapEvent.create({
        data: {
          relationshipId: id,
          event: "renewed",
          oldStatus: existing.status,
          newStatus: "active",
        },
      });
      return { relationship: { ...formatGdap(updated), customer: updated.customer } };
    });
  }
}
