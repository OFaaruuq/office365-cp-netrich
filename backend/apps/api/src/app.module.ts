import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { RequestIdMiddleware } from "./middleware/request-id.middleware";
import { HealthController } from "./health.controller";
import { AuthController } from "./auth.controller";
import { CustomersController } from "./customers.controller";
import { GdapController } from "./gdap.controller";
import { RbacController } from "./rbac.controller";
import { FlagsController } from "./flags.controller";
import { MicrosoftController } from "./microsoft.controller";
import { AuditController } from "./audit.controller";
import { AdminAccessController } from "./admin-access.controller";
import { OnboardingController } from "./onboarding.controller";
import { ApprovalsController } from "./approvals.controller";

@Module({
  controllers: [
    HealthController,
    AuthController,
    CustomersController,
    GdapController,
    RbacController,
    FlagsController,
    MicrosoftController,
    AuditController,
    AdminAccessController,
    OnboardingController,
    ApprovalsController,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
