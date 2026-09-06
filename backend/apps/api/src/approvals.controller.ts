import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { prisma } from "../../../libs/prisma";

/**
 * Privileged operation approvals (four-eyes) — Phase 1 stub.
 * Sensitive: tenant delete, GDAP change, large seat reductions, cancel subscription.
 */
@Controller("approvals")
export class ApprovalsController {
  @Get()
  async list() {
    const items = await prisma.privilegedApproval.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { approvals: items };
  }

  @Post()
  async request(
    @Body()
    body: {
      operation: string;
      customerId?: string;
      payload?: Record<string, unknown>;
      requesterUserId: string;
    }
  ) {
    const item = await prisma.privilegedApproval.create({
      data: {
        operation: body.operation,
        customerId: body.customerId,
        requesterId: body.requesterUserId,
        status: "pending",
        payload: (body.payload || {}) as object,
      },
    });
    await prisma.auditEvent.create({
      data: {
        action: "approval.requested",
        actorType: "user",
        actorUserId: body.requesterUserId,
        targetCustomerId: body.customerId,
        result: "pending",
        riskLevel: "high",
        approvalId: item.id,
        detail: `Approval requested for ${body.operation}`,
      },
    });
    return { approval: item };
  }

  @Post(":id/decide")
  async decide(
    @Param("id") id: string,
    @Body()
    body: {
      decision: "approved" | "rejected";
      approverUserId: string;
    }
  ) {
    const item = await prisma.privilegedApproval.update({
      where: { id },
      data: {
        status: body.decision,
        approverId: body.approverUserId,
        decidedAt: new Date(),
      },
    });
    return { approval: item };
  }
}
