import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
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

export function loadCustomers(): ClientTenant[] {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(FILE)) {
      const seed = CLIENT_TENANTS.map(normalizeCustomer);
      writeFileSync(FILE, JSON.stringify(seed, null, 2), "utf8");
      return seed;
    }
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as ClientTenant[];
    return parsed.map(normalizeCustomer);
  } catch {
    return CLIENT_TENANTS.map(normalizeCustomer);
  }
}

export function saveCustomers(customers: ClientTenant[]) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(customers, null, 2), "utf8");
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
