import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "audit-log.json");
const MAX_ENTRIES = 2000;

export type AuditAction =
  | "auth.login"
  | "auth.login_denied"
  | "auth.logout"
  | "auth.mfa_challenge"
  | "auth.mfa_enroll"
  | "auth.mfa_verify"
  | "auth.mfa_failed"
  | "auth.mfa_reset"
  | "users.create"
  | "users.update"
  | "users.delete"
  | "users.password_change"
  | "tenant.inspect"
  | "tenant.create"
  | "tenant.configure"
  | "tenant.approve"
  | "tenant.reject"
  | "tenant.suspend"
  | "tenant.delete"
  | "tenant.workspace_read"
  | "support.claim"
  | "support.resolve"
  | "support.create"
  | "users.sync"
  | "commerce.subscribe"
  | "commerce.quote"
  | "commerce.invoice"
  | "portal.locked_out";

export type AuditEntry = {
  id: string;
  at: string;
  action: AuditAction;
  actorAccountId: string;
  actorEmail: string;
  actorRole: string;
  customerId?: string;
  detail?: string;
  meta?: Record<string, string | number | boolean | null>;
  /** Compliance-grade optional fields */
  requestId?: string;
  correlationId?: string;
  sessionId?: string;
  actorType?: "user" | "worker" | "service_principal" | "integration" | "system";
  sourceIp?: string;
  userAgent?: string;
  riskLevel?: "low" | "medium" | "high" | "critical";
  approvalId?: string;
  result?: string;
};

function load(): AuditEntry[] {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(FILE)) {
      writeFileSync(FILE, "[]", "utf8");
      return [];
    }
    return JSON.parse(readFileSync(FILE, "utf8")) as AuditEntry[];
  } catch {
    return [];
  }
}

function save(entries: AuditEntry[]) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(entries.slice(0, MAX_ENTRIES), null, 2), "utf8");
}

export function writeAudit(
  entry: Omit<AuditEntry, "id" | "at"> & { at?: string }
): AuditEntry {
  const full: AuditEntry = {
    id: `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at: entry.at || new Date().toISOString(),
    action: entry.action,
    actorAccountId: entry.actorAccountId,
    actorEmail: entry.actorEmail,
    actorRole: entry.actorRole,
    customerId: entry.customerId,
    detail: entry.detail,
    meta: entry.meta,
    requestId: entry.requestId,
    correlationId: entry.correlationId,
    sessionId: entry.sessionId,
    actorType: entry.actorType || "user",
    sourceIp: entry.sourceIp,
    userAgent: entry.userAgent,
    riskLevel: entry.riskLevel || "low",
    approvalId: entry.approvalId,
    result: entry.result || "ok",
  };
  const all = load();
  all.unshift(full);
  save(all);
  return full;
}

export function listAudit(filter?: {
  customerId?: string;
  action?: AuditAction;
  limit?: number;
}): AuditEntry[] {
  let rows = load();
  if (filter?.customerId) {
    rows = rows.filter((r) => r.customerId === filter.customerId);
  }
  if (filter?.action) {
    rows = rows.filter((r) => r.action === filter.action);
  }
  return rows.slice(0, filter?.limit ?? 100);
}
