import { Controller, Get } from "@nestjs/common";
import { prisma } from "../../../libs/prisma";
import { PERMISSIONS, ROLE_PACKS, LEGACY_ROLE_MAP } from "../../../libs/rbac";

@Controller("rbac")
export class RbacController {
  @Get("permissions")
  permissions() {
    return { permissions: PERMISSIONS };
  }

  @Get("roles")
  async roles() {
    const dbRoles = await prisma.role.findMany({
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
  }
}
