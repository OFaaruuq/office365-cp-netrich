import { Prisma, PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export type TenantTx = Prisma.TransactionClient;

export async function withTenantContext<T>(
  opts: { customerId?: string | null; userId?: string | null; role?: string | null },
  fn: (tx: TenantTx) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.customer_id', ${opts.customerId || ""}, true)`;
    await tx.$executeRaw`SELECT set_config('app.user_id', ${opts.userId || ""}, true)`;
    await tx.$executeRaw`SELECT set_config('app.role', ${opts.role || ""}, true)`;
    return fn(tx);
  });
}
