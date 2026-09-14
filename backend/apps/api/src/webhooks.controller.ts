import { Body, Controller, Get, Headers, Param, Post, Query, Req, UnauthorizedException, ConflictException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { Public } from "../../../libs/guards";
import { enqueueJob } from "../../../libs/jobs";

function expectedWebhookSecret() {
  return process.env.WEBHOOK_SECRET || "";
}

function signaturesMatch(provided: string, expectedHex: string) {
  const a = Buffer.from(provided.replace(/^sha256=/i, ""));
  const b = Buffer.from(expectedHex);
  if (!a.length || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

@Public()
@Controller("webhooks")
export class WebhooksController {
  /** Microsoft Graph subscription validation handshake. */
  @Get(":provider")
  challenge(@Query("validationToken") validationToken?: string) {
    if (validationToken) return validationToken;
    return { ok: true, source: "nest" };
  }

  @Post(":provider")
  async ingest(
    @Param("provider") provider: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-webhook-signature") signature?: string,
    @Headers("x-hub-signature-256") hubSignature?: string,
    @Body() body?: Record<string, unknown>
  ) {
    const secret = expectedWebhookSecret();
    if (!secret) {
      throw new ConflictException({
        code: "WEBHOOK_NOT_CONFIGURED",
        message: "Set WEBHOOK_SECRET to accept signed webhook ingress.",
      });
    }
    const raw = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(body || {});
    const digest = createHmac("sha256", secret).update(raw).digest("hex");
    const provided = signature || hubSignature || "";
    const clientState = String(body?.clientState || "");
    const clientStateOk = Boolean(process.env.WEBHOOK_CLIENT_STATE) && clientState === process.env.WEBHOOK_CLIENT_STATE;
    if (!clientStateOk && !signaturesMatch(provided, digest)) {
      throw new UnauthorizedException({ code: "WEBHOOK_SIGNATURE_INVALID" });
    }
    const result = await enqueueJob({
      name: "webhooks.ingest",
      queue: "notifications",
      payload: { provider, body: body || {} },
      role: "partner_admin",
    });
    return { ok: true, provider, job: result.job, source: "nest" };
  }
}
