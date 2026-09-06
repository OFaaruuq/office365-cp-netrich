import { Controller, Get, Query } from "@nestjs/common";
import { prisma } from "../../../libs/prisma";

@Controller("audit")
export class AuditController {
  @Get()
  async list(
    @Query("customerId") customerId?: string,
    @Query("limit") limit?: string
  ) {
    const take = Math.min(Number(limit) || 50, 200);
    const events = await prisma.auditEvent.findMany({
      where: customerId ? { targetCustomerId: customerId } : undefined,
      orderBy: { at: "desc" },
      take,
    });
    return { events };
  }
}
