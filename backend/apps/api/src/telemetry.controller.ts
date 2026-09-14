import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { withTenantContext } from "../../../libs/prisma";
import { CurrentTenant, RequirePermissions, type TenantContext } from "../../../libs/guards";
import { resolveScopedCustomer } from "../../../libs/tenant-scope";
import { acquireGraphToken, fetchSecureScore, fetchServiceHealth } from "../../../libs/graph-client";

@Controller()
export class TelemetryController {
  @RequirePermissions("user.read")
  @Get("service-health")
  async serviceHealth(
    @CurrentTenant() tenant: TenantContext,
    @Query("customerId") customerId?: string
  ) {
    return withTenantContext(tenant, async (tx) => {
      const customer = await resolveScopedCustomer(tx, tenant, customerId);
      const entra = await tx.microsoftTenant.findFirst({
        where: { customerId: customer.id, isPrimary: true },
      });
      const token = await acquireGraphToken(entra?.entraTenantId);
      if (!token.ok) {
        return {
          services: [],
          source: "not_configured",
          code: token.code,
          message: token.message,
        };
      }
      const services = await fetchServiceHealth(token.accessToken);
      return { services, source: "graph" };
    });
  }

  @RequirePermissions("security.read")
  @Get("security")
  async security(
    @CurrentTenant() tenant: TenantContext,
    @Query("customerId") customerId?: string
  ) {
    return withTenantContext(tenant, async (tx) => {
      const customer = await resolveScopedCustomer(tx, tenant, customerId);
      const entra = await tx.microsoftTenant.findFirst({
        where: { customerId: customer.id, isPrimary: true },
      });
      const token = await acquireGraphToken(entra?.entraTenantId);
      if (!token.ok) {
        const latest = await tx.securitySnapshot.findFirst({
          where: { customerId: customer.id },
          orderBy: { capturedAt: "desc" },
        });
        return {
          security: latest
            ? {
                secureScore: latest.secureScore,
                mfaCoverage: latest.mfaPercent,
                threatCount: latest.threatCount,
                source: "postgres",
              }
            : {
                secureScore: 0,
                mfaCoverage: 0,
                privilegedUsers: 0,
                riskyUsers: 0,
                disabledUsers: 0,
                staleAccounts: 0,
                guestAccounts: 0,
                legacyAuth: 0,
                adminMfa: 0,
                recommendations: [
                  {
                    severity: "INFO",
                    text: "Connect Microsoft Graph to populate Secure Score for this tenant.",
                  },
                ],
                source: "not_configured",
              },
          source: latest ? "postgres" : "not_configured",
          code: token.code,
          message: token.message,
        };
      }
      const score = await fetchSecureScore(token.accessToken);
      await tx.securitySnapshot.create({
        data: {
          customerId: customer.id,
          secureScore: score.secureScore,
          mfaPercent: score.mfaCoverage,
          threatCount: 0,
          payload: score as object,
        },
      });
      return { security: score, source: "graph" };
    });
  }
}
