import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import path from "path";
import { CLIENT_TENANTS, DEFAULT_TENANT_CONFIG } from "@/lib/tenancy-data";
import type { ClientTenant } from "@/lib/tenancy-types";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "customers.json");

export function normalizeCustomer(c: ClientTenant): ClientTenant {
  return {
    ...c,
    createdByPartner: c.createdByPartner !== false,
    config: { ...DEFAULT_TENANT_CONFIG, ...(c.config || {}) },
  };
}

/**
 * Load tenants. Fail CLOSED if the live file exists but is unreadable/corrupt
 * (never fall back to "active" seed data — that would undo suspend).
 */
export function loadCustomers(): ClientTenant[] {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(FILE)) {
      const seed = CLIENT_TENANTS.map(normalizeCustomer);
      atomicWrite(FILE, JSON.stringify(seed, null, 2));
      return seed;
    }
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as ClientTenant[];
    if (!Array.isArray(parsed)) {
      console.error("[customer-store] customers.json is not an array — failing closed");
      return [];
    }
    return parsed.map(normalizeCustomer);
  } catch (err) {
    if (existsSync(FILE)) {
      console.error(
        "[customer-store] Failed to read customers.json — failing closed (deny portal)",
        err
      );
      return [];
    }
    try {
      const seed = CLIENT_TENANTS.map(normalizeCustomer);
      atomicWrite(FILE, JSON.stringify(seed, null, 2));
      return seed;
    } catch {
      return [];
    }
  }
}

function atomicWrite(filePath: string, contents: string) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, filePath);
}

export function saveCustomers(customers: ClientTenant[]) {
  atomicWrite(FILE, JSON.stringify(customers, null, 2));
}

export function findCustomer(id: string): ClientTenant | undefined {
  return loadCustomers().find((c) => c.id === id);
}

/** Public fields safe for a client viewing *their own* tenant only */
export function publicTenantView(c: ClientTenant) {
  return {
    id: c.id,
    name: c.name,
    domain: c.domain,
    status: c.status,
    portalAccessEnabled: !!c.config?.portalAccessEnabled,
    allowedCatalogs: c.config?.allowedCatalogs || [],
  };
}
