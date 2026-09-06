/**
 * NestJS TenantContext + RBAC guard stubs (Phase 1).
 * Wire to Prisma SET LOCAL app.customer_id / app.user_id / app.role before queries.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { PermissionKey } from "./rbac";
import { ROLE_PACKS, LEGACY_ROLE_MAP } from "./rbac";
import { prisma } from "./prisma";

export const REQUIRE_PERMISSIONS_KEY = "require_permissions";
export const RequirePermissions = (...perms: PermissionKey[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, perms);

export type TenantContext = {
  userId?: string;
  customerId?: string | null;
  role: string;
  permissions: string[];
};

export const CurrentTenant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TenantContext | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { tenantContext?: TenantContext }>();
    return req.tenantContext;
  }
);

@Injectable()
export class TenantContextGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<
      Request & { tenantContext?: TenantContext; headers: Record<string, string | string[] | undefined> }
    >();
    const roleHeader = String(req.headers["x-portal-role"] || "partner_admin");
    const customerId = String(req.headers["x-customer-id"] || "") || null;
    const userId = String(req.headers["x-user-id"] || "") || undefined;
    const packKey = LEGACY_ROLE_MAP[roleHeader] || roleHeader;
    const pack = ROLE_PACKS.find((p) => p.key === packKey);
    req.tenantContext = {
      userId,
      customerId,
      role: roleHeader,
      permissions: pack?.permissions || [],
    };

    try {
      await prisma.$executeRawUnsafe(
        `SELECT set_config('app.customer_id', $1, true), set_config('app.user_id', $2, true), set_config('app.role', $3, true)`,
        customerId || "",
        userId || "",
        roleHeader
      );
    } catch {
      /* DB may be down during local UI-only work */
    }
    return true;
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
    const req = context.switchToHttp().getRequest<Request & { tenantContext?: TenantContext }>();
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
