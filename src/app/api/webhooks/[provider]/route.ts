import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { cspApiBase, cspInternalSecret } from "@/lib/csp-api";

function signaturesMatch(provided: string, expectedHex: string) {
  const a = Buffer.from(provided.replace(/^sha256=/i, ""));
  const b = Buffer.from(expectedHex);
  if (!a.length || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Public signed webhook ingress. Microsoft Graph subscription validation is GET ?validationToken=. */
export async function GET(
  request: NextRequest,
  _ctx: { params: Promise<{ provider: string }> }
) {
  const token = request.nextUrl.searchParams.get("validationToken");
  if (token) return new NextResponse(token, { status: 200 });
  return new NextResponse(null, { status: 404 });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ provider: string }> }
) {
  const { provider } = await ctx.params;
  const secret = process.env.WEBHOOK_SECRET || "";
  const raw = await request.text();
  if (!secret) {
    return NextResponse.json(
      { ok: false, code: "WEBHOOK_NOT_CONFIGURED", message: "Set WEBHOOK_SECRET to accept signed webhooks." },
      { status: 409 }
    );
  }
  const digest = createHmac("sha256", secret).update(raw).digest("hex");
  const provided =
    request.headers.get("x-webhook-signature") || request.headers.get("x-hub-signature-256") || "";
  let body: Record<string, unknown> = {};
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const hmacOk = signaturesMatch(provided, digest);
  const clientStateOk =
    Boolean(process.env.WEBHOOK_CLIENT_STATE) &&
    String(body.clientState || "") === process.env.WEBHOOK_CLIENT_STATE;
  if (!hmacOk || (process.env.WEBHOOK_CLIENT_STATE && !clientStateOk)) {
    return NextResponse.json({ error: "Invalid signature", code: "WEBHOOK_SIGNATURE_INVALID" }, { status: 401 });
  }

  try {
    const nest = await fetch(`${cspApiBase()}/v1/webhooks/${encodeURIComponent(provider)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-signature": `sha256=${digest}`,
        "x-csp-internal-secret": cspInternalSecret(),
      },
      body: raw,
      signal: AbortSignal.timeout(8000),
    });
    if (nest.ok) {
      return NextResponse.json({ ...(await nest.json()), source: "nest" });
    }
  } catch {
    /* local ack */
  }

  return NextResponse.json({
    ok: true,
    provider,
    source: "local",
    detail: "Accepted locally (Nest not reachable). Payload was not persisted to Postgres.",
  });
}
