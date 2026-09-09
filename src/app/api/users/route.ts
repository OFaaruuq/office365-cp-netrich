import { NextRequest, NextResponse } from "next/server";
import { denyInspectWrite, resolveTenantScope } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit-log";
import {
  createDirectoryUser,
  listDirectoryUsers,
  rollupDirectoryUsers,
  updateDirectoryUser,
} from "@/lib/directory-store";
import { findCustomer } from "@/lib/customer-store";

export async function GET(request: NextRequest) {
  const scope = await resolveTenantScope(request);
  if ("error" in scope) return scope.error;

  if (!findCustomer(scope.customerId)) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const users = listDirectoryUsers(scope.customerId);

  if (scope.inspect) {
    writeAudit({
      action: "tenant.inspect",
      actorAccountId: scope.session.accountId,
      actorEmail: scope.session.email,
      actorRole: scope.session.role,
      customerId: scope.customerId,
      detail: "Partner inspected tenant user directory",
      meta: { path: "/api/users" },
    });
  }

  return NextResponse.json({
    users,
    count: users.length,
    source: "tenant-isolated",
    customerId: scope.customerId,
    userRollup: rollupDirectoryUsers(scope.customerId),
    inspect: scope.inspect,
  });
}

export async function POST(request: NextRequest) {
  const scope = await resolveTenantScope(request);
  if ("error" in scope) return scope.error;
  const blocked = denyInspectWrite(scope);
  if (blocked) return blocked;

  const body = await request.json().catch(() => ({}));
  const displayName = String(body.displayName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  if (!displayName || !email) {
    return NextResponse.json({ error: "displayName and email required" }, { status: 400 });
  }

  const licenses = Array.isArray(body.licenses)
    ? body.licenses.map(String)
    : body.license
      ? [String(body.license)]
      : [];

  const user = createDirectoryUser(scope.customerId, { displayName, email, licenses });
  writeAudit({
    action: "users.create",
    actorAccountId: scope.session.accountId,
    actorEmail: scope.session.email,
    actorRole: scope.session.role,
    customerId: scope.customerId,
    detail: `Created directory user ${email}`,
    meta: { userId: user.id },
  });
  return NextResponse.json({ user, users: listDirectoryUsers(scope.customerId) });
}

export async function PATCH(request: NextRequest) {
  const scope = await resolveTenantScope(request);
  if ("error" in scope) return scope.error;
  const blocked = denyInspectWrite(scope);
  if (blocked) return blocked;

  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId || body.id || "");
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const patch: { status?: "active" | "pending" | "blocked" | "error"; licenses?: string[]; displayName?: string } =
    {};
  if (body.status) patch.status = body.status;
  if (body.action === "block") patch.status = "blocked";
  if (body.action === "unblock") patch.status = "active";
  if (Array.isArray(body.licenses)) patch.licenses = body.licenses.map(String);
  if (body.displayName) patch.displayName = String(body.displayName);

  const user = updateDirectoryUser(scope.customerId, userId, patch);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  writeAudit({
    action: "users.update",
    actorAccountId: scope.session.accountId,
    actorEmail: scope.session.email,
    actorRole: scope.session.role,
    customerId: scope.customerId,
    detail: `Updated directory user ${user.email}`,
    meta: { userId, patch: JSON.stringify(patch) },
  });
  return NextResponse.json({ user, users: listDirectoryUsers(scope.customerId) });
}
