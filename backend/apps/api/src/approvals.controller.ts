import { Body, Controller, Get, Param, Post, BadRequestException } from "@nestjs/common";
import { withTenantContext } from "../../../libs/prisma";
import { CurrentTenant, RequirePartnerAdmin, type TenantContext } from "../../../libs/guards";

/**
 * Privileged operation approvals (four-eyes).
 * Actor ids always come from the authenticated tenant context — never from the body.
 */
@RequirePartnerAdmin()
@Controller("approvals")
export class ApprovalsController {
  @Get()
  async list(@CurrentTenant() tenant: TenantContext) {
    return withTenantContext(tenant, async (tx) => {
      const items = await tx.privilegedApproval.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return { approvals: items };
    });
  }

  @Post()
  async request(
    @CurrentTenant() tenant: TenantContext,
    @Body()
    body: {
      operation: string;
      customerId?: string;
      payload?: Record<string, unknown>;
    }
  ) {
    if (!tenant.userId) {
      throw new BadRequestException({ code: "INVALID_INPUT", message: "Authenticated actor is required" });
    }
    return withTenantContext(tenant, async (tx) => {
      const item = await tx.privilegedApproval.create({
        data: {
          operation: body.operation,
          customerId: body.customerId,
          requesterId: tenant.userId!,
          status: "pending",
          payload: (body.payload || {}) as object,
        },
      });
      await tx.auditEvent.create({
        data: {
          action: "approval.requested",
          actorType: "user",
          actorUserId: tenant.userId,
          targetCustomerId: body.customerId,
          result: "pending",
          riskLevel: "high",
          approvalId: item.id,
          detail: `Approval requested for ${body.operation}`,
        },
      });
      return { approval: item };
    });
  }

  @Post(":id/decide")
  async decide(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body()
    body: {
      decision: "approved" | "rejected";
    }
  ) {
    if (!tenant.userId) {
      throw new BadRequestException({ code: "INVALID_INPUT", message: "Authenticated actor is required" });
    }
    return withTenantContext(tenant, async (tx) => {
      const existing = await tx.privilegedApproval.findUnique({ where: { id } });
      if (!existing) {
        throw new BadRequestException({ code: "NOT_FOUND" });
      }
      if (existing.requesterId === tenant.userId) {
        throw new BadRequestException({
          code: "SELF_APPROVE",
          message: "Four-eyes: requester cannot approve own request",
        });
      }
      const item = await tx.privilegedApproval.update({
        where: { id },
        data: {
          status: body.decision,
          approverId: tenant.userId,
          decidedAt: new Date(),
        },
      });
      return { approval: item };
    });
  }
}
