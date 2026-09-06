import { Controller, Get, Param, Query } from "@nestjs/common";
import { prisma } from "../../../libs/prisma";
import { OnboardingStepKey } from "@prisma/client";

const ALL_STEPS: OnboardingStepKey[] = [
  "customer_created",
  "microsoft_tenant_identified",
  "csp_relationship",
  "gdap_relationship",
  "customer_accepted",
  "application_consent",
  "permissions_verified",
  "graph_sync",
  "partner_center_sync",
  "pricing_configured",
  "client_admin_created",
  "portal_activated",
];

@Controller("customers")
export class CustomersController {
  @Get()
  async list(@Query("lifecycle") lifecycle?: string, @Query("status") status?: string) {
    const customers = await prisma.customer.findMany({
      where: {
        deletedAt: null,
        ...(lifecycle ? { lifecycle: lifecycle as never } : {}),
        ...(status ? { status: status as never } : {}),
      },
      include: {
        microsoftTenants: true,
        contacts: true,
        onboardingSteps: true,
        gdapRelationships: { include: { roles: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      customers: customers.map((c) => ({
        ...c,
        onboarding: summarizeOnboarding(c.onboardingSteps),
      })),
    };
  }

  @Get(":id")
  async one(@Param("id") id: string) {
    const c = await prisma.customer.findFirst({
      where: { OR: [{ id }, { legacyId: id }], deletedAt: null },
      include: {
        microsoftTenants: { include: { domains: true } },
        contacts: true,
        onboardingSteps: true,
        gdapRelationships: {
          include: { roles: true, assignments: true, events: { orderBy: { createdAt: "desc" }, take: 20 } },
        },
        portalUsers: { where: { deleted: false } },
      },
    });
    if (!c) return { error: "Not found", code: "NOT_FOUND" };
    return {
      customer: c,
      onboarding: summarizeOnboarding(c.onboardingSteps),
      gdap: c.gdapRelationships.map(formatGdap),
    };
  }
}

export function summarizeOnboarding(
  steps: Array<{ stepKey: OnboardingStepKey; completed: boolean; completedAt: Date | null }>
) {
  const byKey = Object.fromEntries(steps.map((s) => [s.stepKey, s]));
  const items = ALL_STEPS.map((key) => ({
    key,
    completed: Boolean(byKey[key]?.completed),
    completedAt: byKey[key]?.completedAt || null,
  }));
  const done = items.filter((i) => i.completed).length;
  return { steps: items, completed: done, total: ALL_STEPS.length, percent: Math.round((done / ALL_STEPS.length) * 100) };
}

export function formatGdap(r: {
  id: string;
  microsoftRelationshipId: string | null;
  displayName: string;
  status: string;
  expiresAt: Date | null;
  activatedAt: Date | null;
  durationDays: number | null;
  autoExtend: boolean;
  roles: Array<{ roleName: string; roleDefinitionId: string }>;
}) {
  const remainingDays =
    r.expiresAt != null
      ? Math.ceil((r.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;
  return {
    id: r.id,
    microsoftRelationshipId: r.microsoftRelationshipId,
    displayName: r.displayName,
    status: r.status,
    expiresAt: r.expiresAt,
    activatedAt: r.activatedAt,
    durationDays: r.durationDays,
    autoExtend: r.autoExtend,
    remainingDays,
    roles: r.roles,
  };
}
