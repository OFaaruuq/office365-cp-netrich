import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function withTenantContext<T>(
  opts: { customerId?: string | null; userId?: string | null; role?: string | null },
  fn: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.customer_id', $1, true)`,
      opts.customerId || ""
    );
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.user_id', $1, true)`,
      opts.userId || ""
    );
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.role', $1, true)`,
      opts.role || ""
    );
    return fn(tx as unknown as PrismaClient);
  });
}
