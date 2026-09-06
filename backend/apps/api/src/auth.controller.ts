import {
  Controller,
  Get,
  Post,
  Headers,
  Body,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { prisma } from "../../../libs/prisma";
import { validateEntraAccessToken, hasMfaClaim } from "../../../libs/entra";
import { LEGACY_ROLE_MAP } from "../../../libs/rbac";

@Controller("auth")
export class AuthController {
  @Get("me")
  async me(@Headers("authorization") authorization?: string) {
    const user = await this.resolveUser(authorization);
    if (!user) throw new UnauthorizedException({ code: "UNAUTHORIZED" });
    return { user, authMode: user.entraOid ? "entra" : "mapped" };
  }

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
      `${claims.oid}@unknown`
    ).toLowerCase();

    let user = await prisma.portalUser.findFirst({
      where: {
        OR: [{ entraOid: claims.oid }, { email }],
        deleted: false,
      },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) {
      user = await prisma.portalUser.create({
        data: {
          email,
          name: claims.name || email,
          entraOid: claims.oid,
          entraTid: claims.tid,
          legacyRole: "customer_admin",
          title: "Entra User",
        },
        include: { userRoles: { include: { role: true } } },
      });
    } else if (!user.entraOid) {
      user = await prisma.portalUser.update({
        where: { id: user.id },
        data: { entraOid: claims.oid, entraTid: claims.tid },
        include: { userRoles: { include: { role: true } } },
      });
    }

    if (user.disabled) {
      throw new UnauthorizedException({ code: "ACCOUNT_DISABLED" });
    }

    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        ip: body?.ip,
        userAgent: body?.userAgent,
        expiresAt,
      },
    });

    await prisma.auditEvent.create({
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
        detail: hasMfaClaim(claims) ? "Entra MFA claim present" : "Entra session (MFA claim not detected)",
        meta: { tid: claims.tid || null, oid: claims.oid },
      },
    });

    return {
      sessionId: session.id,
      expiresAt,
      mfaClaimPresent: hasMfaClaim(claims),
      user: this.publicUser(user),
    };
  }

  @Post("logout")
  async logout(@Body() body: { sessionId?: string; all?: boolean; userId?: string }) {
    if (body.all && body.userId) {
      await prisma.session.updateMany({
        where: { userId: body.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { ok: true, revoked: "all" };
    }
    if (body.sessionId) {
      await prisma.session.update({
        where: { id: body.sessionId },
        data: { revokedAt: new Date() },
      });
      return { ok: true, revoked: body.sessionId };
    }
    throw new BadRequestException({ code: "MISSING_SESSION" });
  }

  private async resolveUser(authorization?: string) {
    const bearer = authorization?.replace(/^Bearer\s+/i, "");
    if (!bearer) return null;
    const claims = await validateEntraAccessToken(bearer);
    if (!claims?.oid) return null;
    const user = await prisma.portalUser.findFirst({
      where: { OR: [{ entraOid: claims.oid }], deleted: false },
      include: { userRoles: { include: { role: true } } },
    });
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
