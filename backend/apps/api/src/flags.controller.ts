import { Controller, Get, Query } from "@nestjs/common";
import { prisma } from "../../../libs/prisma";

@Controller("flags")
export class FlagsController {
  @Get()
  async list(@Query("customerId") customerId?: string, @Query("env") env?: string) {
    const environment = env || process.env.NODE_ENV || "development";
    const flags = await prisma.featureFlag.findMany();
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
  }
}
