import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";

/**
 * Legacy keyword bot — requires authenticated session.
 * Live support uses /api/support/threads (tenant-isolated).
 */
export async function POST(request: NextRequest) {
  const auth = await requireSession(request);
  if ("error" in auth) return auth.error;

  // Clients may only use the bot within their own tenant context
  if (
    auth.session.role === "customer_admin" &&
    !auth.session.customerId
  ) {
    return NextResponse.json(
      { error: "No tenant bound to session", code: "NO_TENANT" },
      { status: 403 }
    );
  }

  const body = (await request.json()) as {
    message?: string;
    agentName?: string;
  };

  const message = (body.message || "").trim();
  const agent = body.agentName || "Support";

  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const lower = message.toLowerCase();
  let reply: string;
  const tenantHint =
    auth.session.customerName || auth.session.customerId || "your tenant";

  if (/(license|subscription|sku|seat)/.test(lower)) {
    reply = `I can help with licenses for ${tenantHint}. Open My Products to review seat usage, or Microsoft 365 catalog to add subscriptions.`;
  } else if (/(user|sync|directory|graph)/.test(lower)) {
    reply = `For directory users in ${tenantHint}, go to My Users and click User Sync — that pulls accounts for your isolated tenant only.`;
  } else if (/(renew|bill|invoice|payment)/.test(lower)) {
    reply = `Renewals for ${tenantHint} show on the Dashboard calendar and on each product card under Next Renewal.`;
  } else if (/(azure|dynamics|server)/.test(lower)) {
    reply = `Those catalogs are gated per tenant. If a catalog is missing, ask netrichtechnologies Super Admin to enable it for ${tenantHint}.`;
  } else if (/(hello|hi|hey|thanks|thank)/.test(lower)) {
    reply = `You're welcome — I'm ${agent} with netrichtechnologies. How can I help with ${tenantHint}?`;
  } else if (/(password|mfa|login|sign.?in)/.test(lower)) {
    reply = `Sign-in issues for ${tenantHint} are usually handled in Microsoft Entra ID. I can escalate via live support chat if needed.`;
  } else {
    reply = `Thanks — noted for ${tenantHint}. Prefer live help? Use the support chat so an agent joins your isolated tenant queue.`;
  }

  return NextResponse.json({
    reply,
    agentName: agent,
    customerId: auth.session.customerId || null,
    createdAt: new Date().toISOString(),
  });
}
