import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import path from "path";
import { DEMO_CUSTOMER_IDS, DEFAULT_TENANT_CONFIG } from "@/lib/tenancy-data";
import type { ClientTenant } from "@/lib/tenancy-types";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "customers.json");

export function normalizeCustomer(c: ClientTenant): ClientTenant {
  return {
    ...c,
    createdByPartner: c.createdByPartner !== false,
    config: {
      ...DEFAULT_TENANT_CONFIG,
      ...(c.config || {}),
    },
  };
}

function purgeDemo(customers: ClientTenant[]): { list: ClientTenant[]; changed: boolean } {
  const list = customers.filter((c) => !DEMO_CUSTOMER_IDS.has(c.id)).map(normalizeCustomer);
  return { list, changed: list.length !== customers.length };
}

/**
 * Load tenants. Fail CLOSED if the live file exists but is unreadable/corrupt.
 */
export function loadCustomers(): ClientTenant[] {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(FILE)) {
      atomicWrite(FILE, "[]");
      return [];
    }
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as ClientTenant[];
    if (!Array.isArray(parsed)) {
      console.error("[customer-store] customers.json is not an array — failing closed");
      return [];
    }
    const { list, changed } = purgeDemo(parsed);
    if (changed) saveCustomers(list);
    return list;
  } catch (err) {
    if (existsSync(FILE)) {
      console.error(
        "[customer-store] Failed to read customers.json — failing closed (deny portal)",
        err
      );
      return [];
    }
    try {
      atomicWrite(FILE, "[]");
      return [];
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
  atomicWrite(
    FILE,
    JSON.stringify(
      customers.filter((c) => !DEMO_CUSTOMER_IDS.has(c.id)).map(normalizeCustomer),
      null,
      2
    )
  );
}

export function findCustomer(id: string): ClientTenant | undefined {
  if (DEMO_CUSTOMER_IDS.has(id)) return undefined;
  return loadCustomers().find((c) => c.id === id);
}

/** Super Admin — permanently remove a client tenant from the live store */
export function deleteCustomer(
  id: string
): { ok: true; customer: ClientTenant } | { error: string; code: string } {
  const customers = loadCustomers();
  const idx = customers.findIndex((c) => c.id === id);
  if (idx < 0) {
    return { error: "Tenant not found.", code: "NOT_FOUND" };
  }
  const [customer] = customers.splice(idx, 1);
  saveCustomers(customers);
  return { ok: true, customer };
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
