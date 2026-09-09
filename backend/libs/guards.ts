/**
 * NestJS auth + tenant context + RBAC.
 * Internal calls must present x-csp-internal-secret (set by Next after session auth).
 * Direct callers may present a validated Entra access token.
 * Role headers are never trusted from the public internet.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { timingSafeEqual } from "crypto";
import type { Request } from "express";
import type { PermissionKey } from "./rbac";
import { ROLE_PACKS, LEGACY_ROLE_MAP } from "./rbac";
import { withTenantContext } from "./prisma";
import { validateEntraAccessToken, type EntraClaims } from "./entra";

export const IS_PUBLIC_KEY = "is_public";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const REQUIRE_PARTNER_KEY = "require_partner_admin";
export const RequirePartnerAdmin = () => SetMetadata(REQUIRE_PARTNER_KEY, true);

export const REQUIRE_PERMISSIONS_KEY = "require_permissions";
export const RequirePermissions = (...perms: PermissionKey[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, perms);

const PORTAL_ROLES = new Set([
  "partner_admin",
  "support_technical",
  "support_billing",
  "customer_admin",
  "platform_super_admin",
  "partner_operations_admin",
]);

export type TenantContext = {
  userId?: string;
  customerId?: string | null;
  role: string;
  permissions: string[];
  authSource: "internal" | "entra";
};

export type AuthedRequest = Request & {
  tenantContext?: TenantContext;
  authSource?: "internal" | "entra";
  entraClaims?: EntraClaims;
};

export const CurrentTenant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TenantContext | undefined => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    return req.tenantContext;
  }
);

export function isPartnerRole(role?: string | null): boolean {
  return (
    role === "partner_admin" ||
    role === "platform_super_admin" ||
    role === "partner_operations_admin"
  );
}

function header(req: Request, name: string): string {
  const v = req.headers[name];
  return String(Array.isArray(v) ? v[0] : v || "").trim();
}

function expectedInternalSecret(): string {
  const configured = process.env.CSP_INTERNAL_API_SECRET || "";
  if (configured.length >= 16) return configured;
  if (process.env.NODE_ENV === "production") return "";
  return "netrich-csp-dev-internal-secret";
}

function secretsEqual(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

function isPublicRoute(reflector: Reflector, context: ExecutionContext): boolean {
  return Boolean(
    reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])
  );
}

@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublicRoute(this.reflector, context)) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const expected = expectedInternalSecret();
    const provided = header(req, "x-csp-internal-secret");
    if (secretsEqual(provided, expected)) {
      req.authSource = "internal";
      return true;
    }

    const authorization = header(req, "authorization");
    const bearer = authorization.replace(/^Bearer\s+/i, "");
    if (bearer) {
      const claims = await validateEntraAccessToken(bearer);
      if (claims?.oid) {
        req.authSource = "entra";
        req.entraClaims = claims;
        return true;
      }
    }

    throw new UnauthorizedException({
      code: "UNAUTHORIZED",
      message: "CSP API authentication required",
    });
  }
}

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublicRoute(this.reflector, context)) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();

    if (req.authSource === "entra") {
      const oid = req.entraClaims?.oid;
      if (!oid) {
        throw new UnauthorizedException({ code: "UNAUTHORIZED" });
      }
      const user = await withTenantContext({ role: "partner_admin" }, (tx) =>
        tx.portalUser.findFirst({
          where: { entraOid: oid, deleted: false },
          include: { userRoles: { include: { role: true } } },
        })
      );
      if (!user || user.disabled) {
        throw new UnauthorizedException({ code: "ACCOUNT_DISABLED" });
      }
      const role =
        user.legacyRole ||
        user.userRoles[0]?.role.key ||
        "";
      if (!role || (!PORTAL_ROLES.has(role) && !ROLE_PACKS.some((p) => p.key === role))) {
        throw new ForbiddenException({ code: "ROLE_DENIED" });
      }
      if (role === "customer_admin" && !user.customerId) {
        throw new ForbiddenException({
          code: "NO_TENANT",
          message: "Session is not bound to a client tenant.",
        });
      }
      const packKey = LEGACY_ROLE_MAP[role] || role;
      const pack = ROLE_PACKS.find((p) => p.key === packKey);
      req.tenantContext = {
        userId: user.id,
        customerId: user.customerId,
        role,
        permissions: pack?.permissions || [],
        authSource: "entra",
      };
      return true;
    }

    if (req.authSource !== "internal") {
      throw new UnauthorizedException({ code: "UNAUTHORIZED" });
    }

    const roleHeader = header(req, "x-portal-role");
    if (!roleHeader || !PORTAL_ROLES.has(roleHeader)) {
      throw new ForbiddenException({
        code: "ROLE_DENIED",
        message: "Unknown or missing portal role",
      });
    }
    const customerId = header(req, "x-customer-id") || null;
    const userId = header(req, "x-user-id") || undefined;
    if (roleHeader === "customer_admin" && !customerId) {
      throw new ForbiddenException({
        code: "NO_TENANT",
        message: "Session is not bound to a client tenant.",
      });
    }

    const packKey = LEGACY_ROLE_MAP[roleHeader] || roleHeader;
    const pack = ROLE_PACKS.find((p) => p.key === packKey);
    req.tenantContext = {
      userId,
      customerId,
      role: roleHeader,
      permissions: pack?.permissions || [],
      authSource: "internal",
    };
    return true;
  }
}

@Injectable()
export class PartnerAdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_PARTNER_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (isPartnerRole(req.tenantContext?.role)) return true;
    throw new ForbiddenException({
      code: "SUPER_ADMIN_REQUIRED",
      message: "Access denied.",
    });
  }
}

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<PermissionKey[]>(REQUIRE_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || [];
    if (!required.length) return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const perms = new Set(req.tenantContext?.permissions || []);
    const ok = required.every((p) => perms.has(p));
    if (!ok) {
      throw new ForbiddenException({
        code: "RBAC_DENIED",
        required,
        message: "Missing required permission",
      });
    }
    return true;
  }
}

export function assertCustomerAccess(tenant: TenantContext | undefined, customer: { id: string; legacyId?: string | null }) {
  if (!tenant) {
    throw new UnauthorizedException({ code: "UNAUTHORIZED" });
  }
  if (isPartnerRole(tenant.role)) return;
  const bound = tenant.customerId;
  if (!bound || (bound !== customer.id && bound !== customer.legacyId)) {
    throw new ForbiddenException({
      code: "TENANT_ISOLATION",
      message: "Cross-tenant access denied. Each client tenant is strictly isolated.",
    });
  }
}
