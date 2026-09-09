import { Controller, Get, Param, Query, ForbiddenException, NotFoundException } from "@nestjs/common";
import { OnboardingStepKey } from "@prisma/client";
import { withTenantContext } from "../../../libs/prisma";
import {
  CurrentTenant,
  RequirePartnerAdmin,
  assertCustomerAccess,
  type TenantContext,
} from "../../../libs/guards";

@Controller("customers")
export class CustomersController {
  @RequirePartnerAdmin()
  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query("lifecycle") lifecycle?: string,
    @Query("status") status?: string
  ) {
    return withTenantContext(tenant, async (tx) => {
      const customers = await tx.customer.findMany({
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
    });
  }

  @Get(":id")
  async one(@Param("id") id: string, @CurrentTenant() tenant: TenantContext) {
    return withTenantContext(tenant, async (tx) => {
      const c = await tx.customer.findFirst({
        where: { OR: [{ id }, { legacyId: id }], deletedAt: null },
        include: {
          microsoftTenants: { include: { domains: true } },
          contacts: true,
          onboardingSteps: true,
          gdapRelationships: {
            include: {
              roles: true,
              assignments: true,
              events: { orderBy: { createdAt: "desc" as const }, take: 20 },
            },
          },
          portalUsers: { where: { deleted: false } },
        },
      });
      if (!c) throw new NotFoundException({ error: "Not found", code: "NOT_FOUND" });
      try {
        assertCustomerAccess(tenant, c);
      } catch {
        throw new ForbiddenException({
          code: "TENANT_ISOLATION",
          message: "Cross-tenant access denied. Each client tenant is strictly isolated.",
        });
      }
      return {
        customer: c,
        onboarding: summarizeOnboarding(c.onboardingSteps),
        gdap: c.gdapRelationships.map(formatGdap),
      };
    });
  }
}

export function summarizeOnboarding(
  steps: Array<{ stepKey: OnboardingStepKey; completed: boolean; completedAt: Date | null }>
) {
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
