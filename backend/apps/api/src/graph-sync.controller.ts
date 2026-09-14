import { Body, Controller, Get, Post } from "@nestjs/common";
import { withTenantContext } from "../../../libs/prisma";
import {
  CurrentTenant,
  RequirePartnerAdmin,
  RequirePermissions,
  type TenantContext,
} from "../../../libs/guards";
import { enqueueJob } from "../../../libs/jobs";

@RequirePartnerAdmin()
@Controller("graph-sync")
export class GraphSyncController {
  @RequirePermissions("user.read")
  @Get()
  async list(@CurrentTenant() tenant: TenantContext) {
    return withTenantContext(tenant, async (tx) => {
      const states = await tx.graphSyncState.findMany({
        orderBy: { lastDeltaSync: "desc" },
        take: 200,
      });
      return {
        states: states.map((s) => ({
          customerId: s.customerId,
          resource: s.resource,
          status: s.status,
          lastFullSync: s.lastFullSync,
          lastDeltaSync: s.lastDeltaSync,
          deltaLink: s.deltaLink,
          source: "postgres",
        })),
        source: "postgres",
      };
    });
  }

  @RequirePermissions("user.read")
  @Post()
  async enqueue(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { customerId?: string; name?: string }
  ) {
    const result = await enqueueJob({
      name: body.name || "users.delta_sync",
      queue: "microsoft-sync",
      customerId: body.customerId,
      role: tenant.role,
      userId: tenant.userId,
    });
    return { ...result, source: "nest" };
  }
}
