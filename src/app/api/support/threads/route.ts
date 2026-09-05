import { NextRequest, NextResponse } from "next/server";
import {
  claimThread,
  createThread,
  getThread,
  listThreads,
  markThreadRead,
  resolveThread,
  addMessage,
  unreadForAgent,
  unreadForClient,
} from "@/lib/support-store";
import type { SupportTeam } from "@/lib/tenancy-types";
import {
  assertThreadAccess,
  forbidden,
  requireRoles,
  requireSession,
} from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit-log";

export async function GET(request: NextRequest) {
  const auth = await requireSession(request);
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(request.url);
  const unreadMode = searchParams.get("unread");
  const threadId = searchParams.get("id") || undefined;

  if (session.role === "customer_admin") {
    if (!session.customerId) {
      return forbidden("Client session is not bound to a tenant.", "NO_TENANT");
    }
    if (unreadMode === "client") {
      return NextResponse.json({
        unread: unreadForClient(session.customerId, session.accountId),
      });
    }
    if (threadId) {
      const thread = getThread(threadId);
      if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      const denied = assertThreadAccess(session, thread);
      if (denied) return denied;
      // Same-tenant admins only see their own threads
      if (thread.clientUserId !== session.accountId) {
        return forbidden(
          "Chat belongs to another admin in this tenant.",
          "THREAD_OWNERSHIP"
        );
      }
      return NextResponse.json({ thread });
    }
    const threads = listThreads({
      customerId: session.customerId,
      clientUserId: session.accountId,
    });
    return NextResponse.json({
      threads,
      scope: { customerId: session.customerId, clientUserId: session.accountId },
    });
  }

  if (session.role === "support_technical" || session.role === "support_billing") {
    if (!session.team) {
      return forbidden("Support session has no team assignment.", "NO_TEAM");
    }
    if (unreadMode === "agent") {
      return NextResponse.json({ unread: unreadForAgent(session.team) });
    }
    if (threadId) {
      const thread = getThread(threadId);
      if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      const denied = assertThreadAccess(session, thread);
      if (denied) return denied;
      return NextResponse.json({ thread });
    }
    const status = searchParams.get("status") || undefined;
    const threads = listThreads({
      team: session.team,
      status: status as "queued" | "active" | "resolved" | undefined,
    });
    return NextResponse.json({ threads, scope: { team: session.team } });
  }

  if (session.role === "partner_admin") {
    if (unreadMode === "agent") {
      return NextResponse.json({ unread: unreadForAgent() });
    }
    if (threadId) {
      const thread = getThread(threadId);
      if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      return NextResponse.json({ thread });
    }
    const customerId = searchParams.get("customerId") || undefined;
    const team = (searchParams.get("team") as SupportTeam) || undefined;
    const status = searchParams.get("status") || undefined;
    const threads = listThreads({
      customerId,
      team,
      status: status as "queued" | "active" | "resolved" | undefined,
      allowUnscoped: !customerId && !team,
    });
    return NextResponse.json({ threads, scope: { partner: true } });
  }

  return forbidden("No support access for this role.");
}

export async function POST(request: NextRequest) {
  const auth = await requireSession(request);
  if ("error" in auth) return auth.error;
  const { session } = auth;
  const body = await request.json();
  const action = body.action as string;

  if (action === "create") {
    const client = await requireRoles(request, ["customer_admin"]);
    if ("error" in client) return client.error;
    if (!session.customerId || !session.customerName) {
      return forbidden("Client session is not bound to a tenant.", "NO_TENANT");
    }
    const thread = createThread({
      customerId: session.customerId,
      customerName: session.customerName,
      clientUserId: session.accountId,
      clientUserName: session.name,
      clientUserEmail: session.email,
      team: body.team === "billing" ? "billing" : "technical",
      subject: body.subject,
      firstMessage: body.firstMessage || "Hello, I need assistance.",
    });
    writeAudit({
      action: "support.create",
      actorAccountId: session.accountId,
      actorEmail: session.email,
      actorRole: session.role,
      customerId: session.customerId,
      detail: `Opened ${thread.team} support thread`,
      meta: { threadId: thread.id },
    });
    return NextResponse.json({ thread });
  }

  if (action === "message") {
    const thread = getThread(body.threadId);
    if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    const denied = assertThreadAccess(session, thread);
    if (denied) return denied;
    if (
      session.role === "customer_admin" &&
      thread.clientUserId !== session.accountId
    ) {
      return forbidden("Chat belongs to another admin in this tenant.", "THREAD_OWNERSHIP");
    }

    const isClient = session.role === "customer_admin";
    const isAgent =
      session.role === "partner_admin" ||
      session.role === "support_technical" ||
      session.role === "support_billing";
    if (!isClient && !isAgent) return forbidden("Cannot post messages.");

    const sender = isClient ? "client" : "agent";
    const updated = addMessage(body.threadId, {
      sender,
      senderName: session.name,
      text: body.text,
      readByClient: sender === "client",
      readByAgent: sender === "agent",
    });
    return NextResponse.json({ thread: updated });
  }

  if (action === "claim") {
    const agentAuth = await requireRoles(request, [
      "support_technical",
      "support_billing",
      "partner_admin",
    ]);
    if ("error" in agentAuth) return agentAuth.error;

    const thread = getThread(body.threadId);
    if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

    if (session.role !== "partner_admin") {
      if (!session.team || thread.team !== session.team) {
        return forbidden(
          "Cannot claim a thread outside your support team queue.",
          "TEAM_ISOLATION"
        );
      }
    }

    const team: SupportTeam =
      session.role === "partner_admin" ? thread.team : (session.team as SupportTeam);

    const updated = claimThread(body.threadId, {
      id: session.accountId,
      name: session.name,
      team,
    });
    if (!updated) {
      return NextResponse.json(
        { error: "Claim failed — team mismatch or missing thread.", code: "TEAM_ISOLATION" },
        { status: 403 }
      );
    }
    writeAudit({
      action: "support.claim",
      actorAccountId: session.accountId,
      actorEmail: session.email,
      actorRole: session.role,
      customerId: thread.customerId,
      detail: `Claimed ${team} thread`,
      meta: { threadId: thread.id },
    });
    return NextResponse.json({ thread: updated });
  }

  if (action === "resolve") {
    const thread = getThread(body.threadId);
    if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    const denied = assertThreadAccess(session, thread);
    if (denied) return denied;
    if (session.role === "customer_admin") {
      return forbidden("Only support agents or Super Admin can resolve chats.");
    }
    const updated = resolveThread(body.threadId);
    writeAudit({
      action: "support.resolve",
      actorAccountId: session.accountId,
      actorEmail: session.email,
      actorRole: session.role,
      customerId: thread.customerId,
      detail: "Resolved support thread",
      meta: { threadId: thread.id },
    });
    return NextResponse.json({ thread: updated });
  }

  if (action === "read") {
    const thread = getThread(body.threadId);
    if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    const denied = assertThreadAccess(session, thread);
    if (denied) return denied;
    if (
      session.role === "customer_admin" &&
      thread.clientUserId !== session.accountId
    ) {
      return forbidden("Chat belongs to another admin in this tenant.", "THREAD_OWNERSHIP");
    }
    const reader = session.role === "customer_admin" ? "client" : "agent";
    const updated = markThreadRead(body.threadId, reader);
    return NextResponse.json({ thread: updated });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
