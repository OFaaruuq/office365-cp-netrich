import { Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma, withTenantContext } from "./prisma";
import { acquireGraphToken, syncDirectoryUsers } from "./graph-client";

export async function enqueueJob(input: {
  name: string;
  queue: string;
  customerId?: string | null;
  payload?: object;
  role?: string | null;
  userId?: string | null;
}) {
  const row = await withTenantContext(
    { customerId: input.customerId, userId: input.userId, role: input.role || "partner_admin" },
    (tx) =>
      tx.job.create({
        data: {
          name: input.name,
          queue: input.queue,
          customerId: input.customerId || null,
          status: "queued",
          payload: (input.payload || {}) as object,
        },
      })
  );

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, connectTimeout: 1500, lazyConnect: true });
      await connection.connect();
      const q = new Queue(input.queue, { connection });
      await q.add(input.name, { dbJobId: row.id, customerId: input.customerId, payload: input.payload || {} });
      await q.close();
      await connection.quit();
      return { job: row, dispatched: true as const };
    } catch {
      /* fall through to inline */
    }
  }

  const processed = await processJobById(row.id);
  return { job: processed, dispatched: false as const };
}

export async function processJobById(id: string) {
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return null;
  await prisma.job.update({ where: { id }, data: { status: "running", attempts: { increment: 1 } } });
  try {
    if (job.name === "users.delta_sync" || job.name === "users.sync") {
      const token = await acquireGraphToken();
      if (!token.ok) {
        throw new Error(token.message);
      }
      const users = await syncDirectoryUsers(token.accessToken);
      if (job.customerId) {
        await withTenantContext({ customerId: job.customerId, role: "partner_admin" }, async (tx) => {
          for (const u of users) {
            await tx.directoryUser.upsert({
              where: { customerId_email: { customerId: job.customerId!, email: u.email } },
              create: {
                customerId: job.customerId!,
                graphUserId: u.id,
                displayName: u.displayName,
                email: u.email,
                status: u.status,
                licenses: u.licenses,
                syncedFromGraph: true,
                lastSyncedAt: new Date(),
              },
              update: {
                graphUserId: u.id,
                displayName: u.displayName,
                status: u.status,
                licenses: u.licenses,
                syncedFromGraph: true,
                lastSyncedAt: new Date(),
              },
            });
          }
        });
      }
    }
    const done = await prisma.job.update({
      where: { id },
      data: { status: "succeeded", lastError: null },
    });
    return done;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = job.attempts + 1;
    return prisma.job.update({
      where: { id },
      data: {
        status: attempts >= 5 ? "dead_letter" : "failed",
        lastError: message.slice(0, 1000),
      },
    });
  }
}
