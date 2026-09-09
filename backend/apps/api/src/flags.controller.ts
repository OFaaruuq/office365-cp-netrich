import { Controller, Get, Query } from "@nestjs/common";
import { withTenantContext } from "../../../libs/prisma";
import { CurrentTenant, RequirePartnerAdmin, type TenantContext } from "../../../libs/guards";

@RequirePartnerAdmin()
@Controller("flags")
export class FlagsController {
  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query("customerId") customerId?: string,
    @Query("env") env?: string
  ) {
    const environment = env || process.env.NODE_ENV || "development";
    return withTenantContext(tenant, async (tx) => {
      const flags = await tx.featureFlag.findMany();
      return {
        flags: flags.map((f) => ({
          key: f.key,
          description: f.description,
          enabled:
            f.enabledGlobal ||
            (customerId ? f.customerIds.includes(customerId) : false) ||
            f.environments.includes(environment),
          enabledGlobal: f.enabledGlobal,
          environments: f.environments,
        })),
      };
    });
  }
}
