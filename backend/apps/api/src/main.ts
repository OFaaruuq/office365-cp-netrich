import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { assertHardenedSecrets } from "../../../libs/runtime";

async function bootstrap() {
  assertHardenedSecrets();
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
    rawBody: true,
  });
  const origins = (process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (origins.length) {
    app.enableCors({ origin: origins, credentials: true });
  } else if (process.env.NODE_ENV !== "production") {
    app.enableCors({ origin: "http://localhost:3000", credentials: true });
  }
  app.setGlobalPrefix("v1", { exclude: ["health"] });
  const port = Number(process.env.PORT || 8080);
  await app.listen(port);
  console.log(`[api] listening on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
