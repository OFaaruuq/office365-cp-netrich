import { Controller, Get, Query } from "@nestjs/common";
import { withTenantContext } from "../../../libs/prisma";
import { CurrentTenant, RequirePartnerAdmin, type TenantContext } from "../../../libs/guards";
import { formatGdap } from "./customers.controller";

@RequirePartnerAdmin()
@Controller("gdap")
export class GdapController {
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
}
