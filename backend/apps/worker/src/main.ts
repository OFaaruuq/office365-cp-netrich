import "reflect-metadata";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { processJobById } from "../../../libs/jobs";
import { withTenantContext } from "../../../libs/prisma";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

async function main() {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queues = ["critical", "microsoft-sync", "billing", "maintenance", "notifications"] as const;

  for (const name of queues) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _q = new Queue(name, { connection });
  }

  const handler = async (job: { id?: string; name: string; data: { dbJobId?: string; customerId?: string } }) => {
    if (job.data?.dbJobId) {
      return processJobById(job.data.dbJobId);
    }
    const row = await withTenantContext(
      { customerId: job.data?.customerId, role: "partner_admin" },
      (tx) =>
        tx.job.create({
          data: {
            name: job.name,
            queue: "maintenance",
            customerId: job.data?.customerId,
            status: "queued",
            payload: job.data as object,
          },
        })
    );
    return processJobById(row.id);
  };

  for (const name of queues) {
    const worker = new Worker(name, handler, { connection });
    worker.on("failed", (failedJob, err) => {
      console.error("[worker] failed", failedJob?.name, err.message);
    });
  }

  console.log(`[worker] listening on ${redisUrl} (queues: ${queues.join(", ")})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
