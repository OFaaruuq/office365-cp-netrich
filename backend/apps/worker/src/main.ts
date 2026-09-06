import "reflect-metadata";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "../../../libs/prisma";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

async function main() {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queues = ["critical", "microsoft-sync", "billing", "maintenance"] as const;

  for (const name of queues) {
    // Ensure queue exists
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _q = new Queue(name, { connection });
  }

  const worker = new Worker(
    "maintenance",
    async (job) => {
      console.log(`[worker] job ${job.name}`, job.data);
      await prisma.job.create({
        data: {
          name: job.name,
          queue: "maintenance",
          status: "succeeded",
          payload: job.data as object,
          attempts: 1,
        },
      });
      return { ok: true };
    },
    { connection }
  );

  worker.on("failed", async (job, err) => {
    console.error("[worker] failed", job?.name, err.message);
    if (job) {
      await prisma.job.create({
        data: {
          name: job.name,
          queue: "maintenance",
          status: "failed",
          payload: job.data as object,
          attempts: job.attemptsMade,
          lastError: err.message,
        },
      });
    }
  });

  console.log(`[worker] listening on ${redisUrl} (queues: ${queues.join(", ")})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
