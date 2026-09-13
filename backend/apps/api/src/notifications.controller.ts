import { Controller, Get, Param, Patch, Query, ForbiddenException } from "@nestjs/common";
import { withTenantContext } from "../../../libs/prisma";
import { CurrentTenant, isPartnerRole, type TenantContext } from "../../../libs/guards";

@Controller("notifications")
export class NotificationsController {
  @Get()
  async list(@CurrentTenant() tenant: TenantContext, @Query("customerId") customerId?: string) {
    return withTenantContext(tenant, async (tx) => {
      const where = isPartnerRole(tenant.role)
        ? customerId
          ? { customerId }
          : {}
        : { OR: [{ customerId: tenant.customerId || undefined }, { userId: tenant.userId }] };
      const notifications = await tx.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return { notifications };
    });
  }

  @Patch(":id/read")
  async read(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return withTenantContext(tenant, async (tx) => {
      const n = await tx.notification.findUnique({ where: { id } });
      if (!n) return { ok: false };
      if (!isPartnerRole(tenant.role)) {
        const own = n.userId === tenant.userId || n.customerId === tenant.customerId;
        if (!own) throw new ForbiddenException({ code: "TENANT_ISOLATION" });
      }
      await tx.notification.update({ where: { id }, data: { readAt: new Date() } });
      return { ok: true };
    });
  }
}
