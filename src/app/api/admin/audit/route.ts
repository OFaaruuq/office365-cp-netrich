import { NextRequest, NextResponse } from "next/server";
import { requirePartnerAdmin } from "@/lib/auth/guards";
import { listAudit, type AuditAction } from "@/lib/audit-log";

/** Super Admin only — append-only isolation audit trail */
export async function GET(request: NextRequest) {
  const auth = await requirePartnerAdmin(request);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId") || undefined;
  const action = (searchParams.get("action") as AuditAction) || undefined;
  const limit = Number(searchParams.get("limit") || 50);

  return NextResponse.json({
    events: listAudit({ customerId, action, limit: Math.min(limit, 200) }),
    policy: { tenantIsolation: "hard", appendOnly: true },
  });
}
