import { Controller, Get } from "@nestjs/common";
import { withTenantContext } from "../../../libs/prisma";
import { CurrentTenant, RequirePartnerAdmin, type TenantContext } from "../../../libs/guards";
import { PERMISSIONS, ROLE_PACKS, LEGACY_ROLE_MAP } from "../../../libs/rbac";

@RequirePartnerAdmin()
@Controller("rbac")
export class RbacController {
  @Get("permissions")
  permissions() {
    return { permissions: PERMISSIONS };
  }

  @Get("roles")
  async roles(@CurrentTenant() tenant: TenantContext) {
    return withTenantContext(tenant, async (tx) => {
      const dbRoles = await tx.role.findMany({
        include: { rolePermissions: { include: { permission: true } } },
      });
      return {
        packs: ROLE_PACKS,
        legacyRoleMap: LEGACY_ROLE_MAP,
        roles: dbRoles.map((r) => ({
          key: r.key,
          name: r.name,
          scope: r.scope,
          permissions: r.rolePermissions.map((rp) => rp.permission.key),
        })),
      };
    });
  }
}
