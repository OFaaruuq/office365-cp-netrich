import { loadCustomers, saveCustomers } from "@/lib/customer-store";
import { loadFoundation, saveFoundation } from "@/lib/foundation-store";
import { loadPlatform, savePlatform } from "@/lib/platform-store";

export function executeLocalApproval(id: string, actorEmail: string) {
  const platform = loadPlatform();
  const item = platform.approvals.find((a) => a.id === id);
  if (!item) return { error: "Approval not found", code: "NOT_FOUND" as const };
  if (item.status !== "approved") {
    return { error: `Cannot execute approval in status ${item.status}`, code: "INVALID_STATE" as const };
  }

  const op = item.operation || "";
  const customerId = item.customerId;
  const now = new Date().toISOString();

  if (customerId && /(suspend|TERMINATING|terminate|delete|lifecycle)/i.test(op)) {
    const customers = loadCustomers();
    const c = customers.find((x) => x.id === customerId);
    if (!c) return { error: "Tenant not found", code: "TENANT_NOT_FOUND" as const };
    if (/suspend/i.test(op)) {
      c.status = "suspended";
      c.lifecycle = "SUSPENDED";
      c.config = { ...c.config, portalAccessEnabled: false };
    } else {
      c.lifecycle = "TERMINATING";
      c.config = { ...c.config, portalAccessEnabled: false };
    }
    saveCustomers(customers);
  } else if (customerId && /gdap\.renew/i.test(op)) {
    const data = loadFoundation();
    const payload = item.payload as { gdapId?: string } | undefined;
    const g =
      data.gdap.find((x) => x.id === String(payload?.gdapId || "")) ||
      data.gdap.find((x) => x.customerId === customerId);
    if (g) {
      const expires = new Date();
      expires.setDate(expires.getDate() + (g.durationDays || 180));
      g.expiresAt = expires.toISOString();
      g.status = "active";
      saveFoundation(data);
    }
  }

  item.status = "executed";
  (item as { executedAt?: string; executedBy?: string }).executedAt = now;
  (item as { executedAt?: string; executedBy?: string }).executedBy = actorEmail;
  savePlatform(platform);
  return { approval: item };
}
