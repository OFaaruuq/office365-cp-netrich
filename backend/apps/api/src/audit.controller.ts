import { Controller, Get, Query, ForbiddenException } from "@nestjs/common";
import { withTenantContext } from "../../../libs/prisma";
import {
  CurrentTenant,
  isPartnerRole,
  type TenantContext,
} from "../../../libs/guards";

@Controller("audit")
export class AuditController {
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
