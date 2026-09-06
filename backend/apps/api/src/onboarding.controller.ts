import { Body, Controller, Param, Patch } from "@nestjs/common";
import { OnboardingStepKey } from "@prisma/client";
import { prisma } from "../../../libs/prisma";
import { summarizeOnboarding } from "./customers.controller";

@Controller("onboarding")
export class OnboardingController {
  @Patch(":customerId/steps/:stepKey")
  async completeStep(
    @Param("customerId") customerId: string,
    @Param("stepKey") stepKey: string,
    @Body() body: { completed?: boolean; meta?: object }
  ) {
    const customer = await prisma.customer.findFirst({
      where: { OR: [{ id: customerId }, { legacyId: customerId }] },
    });
    if (!customer) return { error: "Not found", code: "NOT_FOUND" };

    const key = stepKey as OnboardingStepKey;
    await prisma.onboardingStep.upsert({
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

    const steps = await prisma.onboardingStep.findMany({
      where: { customerId: customer.id },
    });
    return { onboarding: summarizeOnboarding(steps) };
  }
}
