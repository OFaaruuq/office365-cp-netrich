import { Body, Controller, Param, Patch, NotFoundException } from "@nestjs/common";
import { OnboardingStepKey } from "@prisma/client";
import { withTenantContext } from "../../../libs/prisma";
import { CurrentTenant, RequirePartnerAdmin, type TenantContext } from "../../../libs/guards";
import { summarizeOnboarding } from "./customers.controller";

@RequirePartnerAdmin()
@Controller("onboarding")
export class OnboardingController {
  @Patch(":customerId/steps/:stepKey")
  async completeStep(
    @CurrentTenant() tenant: TenantContext,
    @Param("customerId") customerId: string,
    @Param("stepKey") stepKey: string,
    @Body() body: { completed?: boolean; meta?: object }
  ) {
    return withTenantContext(tenant, async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { OR: [{ id: customerId }, { legacyId: customerId }] },
      });
      if (!customer) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });

      const key = stepKey as OnboardingStepKey;
      await tx.onboardingStep.upsert({
        where: {
          customerId_stepKey: { customerId: customer.id, stepKey: key },
        },
        create: {
          customerId: customer.id,
          stepKey: key,
          completed: body.completed !== false,
          completedAt: body.completed === false ? null : new Date(),
          meta: body.meta || undefined,
        },
        update: {
          completed: body.completed !== false,
          completedAt: body.completed === false ? null : new Date(),
          meta: body.meta || undefined,
        },
      });

      const steps = await tx.onboardingStep.findMany({
        where: { customerId: customer.id },
      });
      return { onboarding: summarizeOnboarding(steps) };
    });
  }
}
