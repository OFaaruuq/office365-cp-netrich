import { Controller, Get } from "@nestjs/common";
import { prisma } from "../../../libs/prisma";
import { getSamConfigStatus } from "../../../libs/sam";
import { Public } from "../../../libs/guards";

@Controller()
export class HealthController {
  @Public()
  @Get("health")
  async health() {
    let postgres: "healthy" | "down" = "down";
    try {
      await prisma.$queryRaw`SELECT 1`;
      postgres = "healthy";
    } catch {
      postgres = "down";
    }

    let redis: "healthy" | "down" | "not_configured" = "not_configured";
    if (process.env.REDIS_URL) {
      try {
        const Redis = (await import("ioredis")).default;
        const client = new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: 1,
          connectTimeout: 1500,
          lazyConnect: true,
        });
        await client.connect();
        const pong = await client.ping();
        redis = pong === "PONG" ? "healthy" : "down";
        await client.quit();
      } catch {
        redis = "down";
      }
    }

    const sam = getSamConfigStatus();
    return {
      ok: postgres === "healthy",
      service: "netrich-csp-api",
      stage: "foundation",
      postgres,
      redis,
      workers: "stub",
      microsoft: sam.components,
      timestamp: new Date().toISOString(),
    };
  }
}
