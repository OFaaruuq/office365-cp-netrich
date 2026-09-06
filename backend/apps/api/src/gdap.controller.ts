import { Controller, Get, Query } from "@nestjs/common";
import { prisma } from "../../../libs/prisma";
import { formatGdap } from "./customers.controller";

@Controller("gdap")
export class GdapController {
  @Get()
  async list(@Query("expiringWithinDays") expiringWithinDays?: string) {
    const days = expiringWithinDays ? Number(expiringWithinDays) : undefined;
    const relationships = await prisma.gdapRelationship.findMany({
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
  }
}
