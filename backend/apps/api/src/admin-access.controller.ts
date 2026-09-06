import { Body, Controller, Post, BadRequestException } from "@nestjs/common";
import { prisma } from "../../../libs/prisma";

@Controller("admin-access")
export class AdminAccessController {
  /** Controlled view-as-customer (read-only by default) */
  @Post()
  async start(
    @Body()
    body: {
      actorUserId?: string;
      customerId?: string;
      reason?: string;
      durationMinutes?: number;
      readOnly?: boolean;
    }
  ) {
    if (!body.actorUserId || !body.customerId || !body.reason?.trim()) {
      throw new BadRequestException({
        code: "INVALID_INPUT",
        message: "actorUserId, customerId, and reason are required",
      });
    }
    const minutes = Math.min(Math.max(body.durationMinutes || 15, 5), 120);
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
    const session = await prisma.adminAccessSession.create({
      data: {
        actorUserId: body.actorUserId,
        customerId: body.customerId,
        reason: body.reason.trim(),
        readOnly: body.readOnly !== false,
        expiresAt,
      },
      include: { customer: true },
    });
    await prisma.auditEvent.create({
      data: {
        action: "TENANT_IMPERSONATED",
        actorType: "user",
        actorUserId: body.actorUserId,
        targetCustomerId: body.customerId,
        riskLevel: "high",
        result: "ok",
        detail: `View-as-customer started: ${body.reason.trim()} (${minutes}m, readOnly=${session.readOnly})`,
        meta: { adminAccessSessionId: session.id },
      },
    });
    return {
      session: {
        id: session.id,
        customerId: session.customerId,
        customerName: session.customer.name,
        reason: session.reason,
        readOnly: session.readOnly,
        expiresAt: session.expiresAt,
        banner: `Viewing ${session.customer.name} as Partner Administrator (read-only)`,
      },
    };
  }
}
