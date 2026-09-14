import { Body, Controller, Get, Post, Query, NotFoundException } from "@nestjs/common";
import { withTenantContext } from "../../../libs/prisma";
import { CurrentTenant, RequirePartnerAdmin, RequirePermissions, type TenantContext } from "../../../libs/guards";
import { enqueueJob, processJobById } from "../../../libs/jobs";

@RequirePartnerAdmin()
@Controller("jobs")
export class JobsController {
  @RequirePermissions("platform.admin")
  @Get()
  async list(@CurrentTenant() tenant: TenantContext, @Query("status") status?: string) {
    return withTenantContext(tenant, async (tx) => {
      const jobs = await tx.job.findMany({
        where: status ? { status: status as never } : undefined,
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return { jobs };
    });
  }

  @RequirePermissions("platform.admin")
  @Post()
  async enqueue(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { name?: string; queue?: string; customerId?: string; payload?: object }
  ) {
    const result = await enqueueJob({
      name: body.name || "maintenance.ping",
      queue: body.queue || "maintenance",
      customerId: body.customerId,
      payload: body.payload,
      role: tenant.role,
      userId: tenant.userId,
    });
    return result;
  }

  @RequirePermissions("platform.admin")
  @Post("retry")
  async retry(@Body() body: { jobId?: string }) {
    if (!body.jobId) throw new NotFoundException({ code: "JOB_REQUIRED" });
    const job = await processJobById(body.jobId);
    if (!job) throw new NotFoundException({ code: "NOT_FOUND" });
    return { job, source: "nest" };
  }
}
