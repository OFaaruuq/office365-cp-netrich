import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { findCustomer } from "@/lib/customer-store";
import { addMessage, createThread, listThreads } from "@/lib/support-store";
import type { SupportTeam } from "@/lib/tenancy-types";

function teamFromMessage(message: string): SupportTeam {
  return /(bill|invoice|renew|payment|quote)/i.test(message) ? "billing" : "technical";
}

/**
 * Authenticated support intake — creates or appends a tenant-isolated thread.
 * Live chat widget uses /api/support/threads; this route is the same SoR.
 */
export async function POST(request: NextRequest) {
  const auth = await requireSession(request);
  if ("error" in auth) return auth.error;

  if (auth.session.role === "customer_admin" && !auth.session.customerId) {
    return NextResponse.json(
      { error: "No tenant bound to session", code: "NO_TENANT" },
      { status: 403 }
    );
  }

  const body = (await request.json()) as {
    message?: string;
    agentName?: string;
    customerId?: string;
    team?: SupportTeam;
  };

  const message = (body.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const customerId =
    auth.session.role === "customer_admin"
      ? auth.session.customerId
      : body.customerId || auth.session.customerId;
  if (!customerId) {
    return NextResponse.json(
      { error: "customerId required so the message stays in one tenant queue", code: "CUSTOMER_REQUIRED" },
      { status: 400 }
    );
  }

  const customer = findCustomer(customerId);
  const team = body.team === "billing" || body.team === "technical" ? body.team : teamFromMessage(message);
  const existing = listThreads({
    customerId,
    clientUserId: auth.session.accountId,
    team,
  }).find((t) => t.status !== "resolved");

  const thread = existing
    ? addMessage(existing.id, {
        sender: "client",
        senderName: auth.session.name,
        text: message,
        readByClient: true,
        readByAgent: false,
      })
    : createThread({
        customerId,
        customerName: customer?.name || auth.session.customerName || customerId,
        clientUserId: auth.session.accountId,
        clientUserName: auth.session.name,
        clientUserEmail: auth.session.email,
        team,
        subject: message.slice(0, 80),
        firstMessage: message,
      });

  if (!thread) {
    return NextResponse.json({ error: "Could not record support message" }, { status: 500 });
  }

  const queue = team === "billing" ? "Billing" : "Technical";
  return NextResponse.json({
    reply: `Your message was added to the ${queue} Support queue for ${customer?.name || customerId}. An agent will reply in live support chat.`,
    agentName: body.agentName || "Support",
    customerId,
    threadId: thread.id,
    source: "support-threads",
    createdAt: new Date().toISOString(),
  });
}
