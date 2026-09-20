import { Queue } from "bullmq";
import IORedis from "ioredis";
import { withTenantContext, type TenantTx } from "./prisma";
import { acquireGraphToken, fetchSecureScore, fetchServiceHealth, syncDirectoryUsers } from "./graph-client";
import { acquirePartnerCenterToken, listPartnerCenterCustomers } from "./partner-center";

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

async function resolveCustomerId(tx: TenantTx, customerId: string) {
  const customer = await tx.customer.findFirst({
    where: { OR: [{ id: customerId }, { legacyId: customerId }] },
  });
  return customer?.id;
}

async function entraTenantForCustomer(tx: TenantTx, customerId: string) {
  const id = await resolveCustomerId(tx, customerId);
  if (!id) return undefined;
  const row = await tx.microsoftTenant.findFirst({
    where: { customerId: id, isPrimary: true },
  });
  return row?.entraTenantId || (await tx.microsoftTenant.findFirst({ where: { customerId: id } }))?.entraTenantId;
}

export async function processJobById(id: string) {
  const existing = await withTenantContext({ role: "partner_admin" }, (tx) =>
    tx.job.findUnique({ where: { id } })
  );
  if (!existing) return null;

  return withTenantContext(
    { customerId: existing.customerId, role: "partner_admin" },
    async (tx) => {
      const job = await tx.job.update({
        where: { id },
        data: { status: "running", attempts: { increment: 1 } },
      });
      try {
        if (job.name === "users.delta_sync" || job.name === "users.sync") {
          if (!job.customerId) throw new Error("customerId required for directory sync");
          const customerId = await resolveCustomerId(tx, job.customerId);
          if (!customerId) throw new Error("Customer not found for directory sync");
          const entra = await entraTenantForCustomer(tx, customerId);
          if (!entra) throw new Error("Customer Entra tenant id is required for Graph sync");
          const token = await acquireGraphToken(entra);
          if (!token.ok) throw new Error(token.message);
          const users = await syncDirectoryUsers(token.accessToken);
          for (const u of users) {
            await tx.directoryUser.upsert({
              where: { customerId_email: { customerId, email: u.email } },
              create: {
                customerId,
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
        } else if (job.name === "security.secure_score_sync") {
          if (!job.customerId) throw new Error("customerId required");
          const customerId = await resolveCustomerId(tx, job.customerId);
          if (!customerId) throw new Error("Customer not found");
          const entra = await entraTenantForCustomer(tx, customerId);
          if (!entra) throw new Error("Customer Entra tenant id is required for Secure Score sync");
          const token = await acquireGraphToken(entra);
          if (!token.ok) throw new Error(token.message);
          const score = await fetchSecureScore(token.accessToken);
          await tx.securitySnapshot.create({
            data: {
              customerId,
              secureScore: score.secureScore,
              mfaPercent: score.mfaCoverage,
              threatCount: 0,
              payload: score as object,
            },
          });
        } else if (job.name === "service.health_sync") {
          if (!job.customerId) throw new Error("customerId required");
          const entra = await entraTenantForCustomer(tx, job.customerId);
          if (!entra) throw new Error("Customer Entra tenant id is required for service health sync");
          const token = await acquireGraphToken(entra);
          if (!token.ok) throw new Error(token.message);
          await fetchServiceHealth(token.accessToken);
        } else if (job.name === "catalog.sync" || job.name === "partner_center.customers_sync") {
          const token = await acquirePartnerCenterToken();
          if (!token.ok) throw new Error(token.message);
          await listPartnerCenterCustomers(token.accessToken);
        } else if (job.name === "webhooks.ingest" || job.name === "maintenance.ping") {
          /* payload already stored on the job row */
        }
        return tx.job.update({
          where: { id },
          data: { status: "succeeded", lastError: null },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const attempts = job.attempts;
        return tx.job.update({
          where: { id },
          data: {
            status: attempts >= 5 ? "dead_letter" : "failed",
            lastError: message.slice(0, 1000),
          },
        });
      }
    }
  );
}
