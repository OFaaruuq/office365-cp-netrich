import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { assertCustomerAccess, isPartnerRole, type TenantContext } from "./guards";

export async function resolveScopedCustomer(
  tx: Prisma.TransactionClient,
  tenant: TenantContext,
  customerId?: string | null
) {
  const id = isPartnerRole(tenant.role) ? customerId || tenant.customerId : tenant.customerId;
  if (!id) throw new NotFoundException({ code: "CUSTOMER_REQUIRED" });
  const customer = await tx.customer.findFirst({
    where: { OR: [{ id }, { legacyId: id }] },
  });
  if (!customer) throw new NotFoundException({ code: "NOT_FOUND" });
  assertCustomerAccess(tenant, customer);
  return customer;
}
