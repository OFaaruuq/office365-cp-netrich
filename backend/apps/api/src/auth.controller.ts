import {
  Controller,
  Get,
  Post,
  Headers,
  Body,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { withTenantContext } from "../../../libs/prisma";
import { validateEntraAccessToken, hasMfaClaim } from "../../../libs/entra";
import { LEGACY_ROLE_MAP } from "../../../libs/rbac";
import {
  CurrentTenant,
  Public,
  isPartnerRole,
  type TenantContext,
} from "../../../libs/guards";

@Controller("auth")
export class AuthController {
  @Get("me")
  async me(
    @CurrentTenant() tenant: TenantContext,
    @Headers("authorization") authorization?: string
  ) {
    if (tenant.authSource === "entra") {
      const user = await this.resolveUser(authorization);
      if (!user) throw new UnauthorizedException({ code: "UNAUTHORIZED" });
      return { user, authMode: user.entraOid ? "entra" : "mapped" };
    }
    return withTenantContext(tenant, async (tx) => {
      if (!tenant.userId) throw new UnauthorizedException({ code: "UNAUTHORIZED" });
      const row = await tx.portalUser.findFirst({
        where: { OR: [{ id: tenant.userId }, { legacyId: tenant.userId }], deleted: false },
        include: { userRoles: { include: { role: true } } },
      });
      if (!row) {
        return {
          user: {
            id: tenant.userId,
            rolePack: tenant.role,
            customerId: tenant.customerId,
            mapped: false,
          },
          authMode: "internal",
        };
      }
      return { user: this.publicUser(row), authMode: "internal" };
    });
  }

  @Public()
  @Post("session")
  async createSession(
    @Headers("authorization") authorization?: string,
    @Body() body?: { ip?: string; userAgent?: string }
  ) {
    const bearer = authorization?.replace(/^Bearer\s+/i, "");
    if (!bearer) throw new UnauthorizedException({ code: "MISSING_TOKEN" });

    const claims = await validateEntraAccessToken(bearer);
    if (!claims?.oid) {
      throw new UnauthorizedException({
        code: "ENTRA_VALIDATION_FAILED",
        message:
          "Set AZURE_AD_API_AUDIENCE and send a valid Entra access token. Demo login remains on Next.js only.",
      });
    }

    const email = (
      claims.preferred_username ||
      claims.email ||
      ""
    ).toLowerCase();

    return withTenantContext({ role: "partner_admin" }, async (tx) => {
      const found = await tx.portalUser.findFirst({
        where: {
          OR: [{ entraOid: claims.oid }, ...(email ? [{ email }] : [])],
          deleted: false,
        },
        include: { userRoles: { include: { role: true } } },
      });

      if (!found) {
        throw new UnauthorizedException({
          code: "USER_NOT_PROVISIONED",
          message:
            "No portal account is mapped for this Entra identity. Ask netrichtechnologies Super Admin to provision access.",
        });
      }

      let user = found;

      if (!user.entraOid) {
        user = await tx.portalUser.update({
          where: { id: user.id },
          data: { entraOid: claims.oid, entraTid: claims.tid },
          include: { userRoles: { include: { role: true } } },
        });
      }

      if (user.disabled) {
        throw new UnauthorizedException({ code: "ACCOUNT_DISABLED" });
      }

      if (user.legacyRole === "customer_admin" && !user.customerId) {
        throw new ForbiddenException({
          code: "NO_TENANT",
          message: "Client account is not bound to a tenant.",
        });
      }

      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
      const session = await tx.session.create({
        data: {
          userId: user.id,
          ip: body?.ip,
          userAgent: body?.userAgent,
          expiresAt,
        },
      });

      await tx.auditEvent.create({
        data: {
          action: "auth.entra_session",
          actorType: "user",
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.legacyRole || undefined,
          sessionId: session.id,
          sourceIp: body?.ip,
          result: "ok",
          riskLevel: "low",
          detail: hasMfaClaim(claims)
            ? "Entra MFA claim present"
            : "Entra session (MFA claim not detected)",
          meta: { tid: claims.tid || null, oid: claims.oid },
        },
      });

      return {
        sessionId: session.id,
        expiresAt,
        mfaClaimPresent: hasMfaClaim(claims),
        user: this.publicUser(user),
      };
    });
  }

  @Post("logout")
  async logout(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { sessionId?: string; all?: boolean }
  ) {
    return withTenantContext(tenant, async (tx) => {
      if (body.all) {
        if (!tenant.userId) throw new BadRequestException({ code: "MISSING_SESSION" });
        await tx.session.updateMany({
          where: { userId: tenant.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return { ok: true, revoked: "all" };
      }
      if (body.sessionId) {
        const row = await tx.session.findUnique({ where: { id: body.sessionId } });
        if (!row) throw new BadRequestException({ code: "MISSING_SESSION" });
        if (!isPartnerRole(tenant.role) && row.userId !== tenant.userId) {
          throw new ForbiddenException({ code: "TENANT_ISOLATION" });
        }
        await tx.session.update({
          where: { id: body.sessionId },
          data: { revokedAt: new Date() },
        });
        return { ok: true, revoked: body.sessionId };
      }
      throw new BadRequestException({ code: "MISSING_SESSION" });
    });
  }

  private async resolveUser(authorization?: string) {
    const bearer = authorization?.replace(/^Bearer\s+/i, "");
    if (!bearer) return null;
    const claims = await validateEntraAccessToken(bearer);
    if (!claims?.oid) return null;
    const user = await withTenantContext({ role: "partner_admin" }, (tx) =>
      tx.portalUser.findFirst({
        where: { entraOid: claims.oid, deleted: false },
        include: { userRoles: { include: { role: true } } },
      })
    );
    return user ? this.publicUser(user) : null;
  }

  private publicUser(user: {
    id: string;
    email: string;
    name: string;
    title: string;
    customerId: string | null;
    partnerId: string | null;
    legacyRole: string | null;
    entraOid: string | null;
    disabled: boolean;
    breakGlass: boolean;
    userRoles?: Array<{ role: { key: string; name: string } }>;
  }) {
    const pack =
      user.userRoles?.[0]?.role.key ||
      (user.legacyRole ? LEGACY_ROLE_MAP[user.legacyRole] : null);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      title: user.title,
      customerId: user.customerId,
      partnerId: user.partnerId,
      legacyRole: user.legacyRole,
      rolePack: pack,
      entraOid: user.entraOid,
      disabled: user.disabled,
      breakGlass: user.breakGlass,
    };
  }
}
