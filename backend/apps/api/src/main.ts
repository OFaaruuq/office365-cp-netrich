import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });
  const origins = (process.env.CORS_ORIGINS || "http://localhost:3000").split(",");
  app.enableCors({ origin: origins, credentials: true });
  app.setGlobalPrefix("v1", { exclude: ["health"] });
  const port = Number(process.env.PORT || 8080);
  await app.listen(port);
  console.log(`[api] listening on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
