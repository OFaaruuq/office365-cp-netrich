import { Controller, Get, Query, ForbiddenException } from "@nestjs/common";
import { withTenantContext } from "../../../libs/prisma";
import {
  CurrentTenant,
  isPartnerRole,
  RequirePermissions,
  type TenantContext,
} from "../../../libs/guards";

@Controller("audit")
export class AuditController {
  @RequirePermissions("audit.read")
  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query("customerId") customerId?: string,
    @Query("limit") limit?: string
  ) {
    const take = Math.min(Number(limit) || 50, 200);
    let target = customerId;
    if (!isPartnerRole(tenant.role)) {
      target = tenant.customerId || undefined;
      if (!target) {
        throw new ForbiddenException({ code: "TENANT_ISOLATION" });
      }
    } else if (!target && !tenant.permissions.includes("platform.admin")) {
      throw new ForbiddenException({
        code: "CUSTOMER_REQUIRED",
        message: "Specify customerId to read tenant audit events.",
      });
    }
    return withTenantContext(tenant, async (tx) => {
      const events = await tx.auditEvent.findMany({
        where: target ? { targetCustomerId: target } : undefined,
        orderBy: { at: "desc" },
        take,
      });
      return { events };
    });
  }
}
