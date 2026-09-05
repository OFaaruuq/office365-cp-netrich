import {
  costSummary as baseCost,
  recommendations as baseRecs,
  renewals as baseRenewals,
  subscriptions as baseSubs,
  userRollup as baseRollup,
  users as baseUsers,
  azureCatalog,
  dynamics365Catalog,
  microsoft365Catalog,
  serverSoftwareCatalog,
} from "@/lib/mock-data";
import { findCustomer } from "@/lib/customer-store";
import type { CatalogProduct, PortalUser, Subscription } from "@/lib/types";

export type TenantWorkspace = {
  customerId: string;
  domain: string;
  name: string;
  users: PortalUser[];
  userRollup: typeof baseRollup;
  subscriptions: Subscription[];
  costSummary: typeof baseCost;
  renewals: typeof baseRenewals;
  recommendations: typeof baseRecs;
  allowedCatalogs: Array<"microsoft-365" | "dynamics-365" | "azure" | "server-software">;
  /** Isolated security posture metrics — never shared across tenants */
  securityPosture: {
    mfaPercent: number;
    threatEvents30d: number;
    secureScore: number;
    lastAssessedAt: string;
  };
};

function remapEmail(email: string, domain: string): string {
  const local = email.split("@")[0] || "user";
  return `${local}@${domain}`;
}

/** Isolated workspace snapshot — never share another tenant's rows */
export function getTenantWorkspace(customerId: string): TenantWorkspace | null {
  const customer = findCustomer(customerId);
  if (!customer) return null;

  const domain = customer.domain;
  const scale =
    customerId === "cust-orbit"
      ? 0.35
      : customerId === "cust-sigma"
        ? 0.55
        : customerId === "cust-nile"
          ? 0.05
          : 1;

  const users = baseUsers.slice(0, Math.max(2, Math.round(baseUsers.length * scale))).map(
    (u, i) => ({
      ...u,
      id: `${customerId}-${u.id}`,
      email: remapEmail(u.email, domain),
      displayName:
        customerId === "cust-orbit"
          ? ["Maya Chen", "Jonas Berg", "Priya Shah", "Leo Martins"][i % 4] || u.displayName
          : customerId === "cust-sigma"
            ? ["Dr. Amira Said", "Noah Klein", "Elena Ruiz", "Sam Patel"][i % 4] ||
              u.displayName
            : u.displayName,
    })
  );

  const active = users.filter((u) => u.status === "active").length;
  const blocked = users.filter((u) => u.status === "blocked").length;

  const subscriptions = baseSubs.map((s, idx) => {
    const purchased = Math.max(
      customerId === "cust-nile" ? 0 : 1,
      Math.round(s.purchased * scale)
    );
    const used = Math.min(purchased, Math.round(s.used * scale));
    return {
      ...s,
      id: `${customerId}-${s.id}`,
      purchased,
      used,
      available: Math.max(0, purchased - used),
      price: Number((s.price * scale).toFixed(2)),
      // Orbit only keeps first sub “alert” free
      hasAlert: customerId === "cust-amtel" ? s.hasAlert : idx === 1 && customerId === "cust-sigma",
    };
  }).filter((s) => s.purchased > 0 || customer.status === "active");

  const monthly = Number(
    (customer.monthlySpend || subscriptions.reduce((n, s) => n + s.price, 0)).toFixed(2)
  );

  // Deterministic per-tenant security metrics (isolated, not global)
  const hash = customerId.split("").reduce((n, ch) => n + ch.charCodeAt(0), 0);
  const securityPosture = {
    mfaPercent: Math.min(99, 70 + (hash % 25)),
    threatEvents30d: hash % 17,
    secureScore: Math.min(95, 55 + (hash % 35)),
    lastAssessedAt: customer.lastSyncAt || new Date().toISOString(),
  };

  return {
    customerId,
    domain,
    name: customer.name,
    users,
    userRollup: {
      active,
      pending: 0,
      blocked,
      error: 0,
    },
    subscriptions,
    costSummary: { monthly, yearly: 0, triennially: 0 },
    renewals: baseRenewals.map((r) => ({
      ...r,
      id: `${customerId}-${r.id}`,
      licenses: Math.max(1, Math.round(r.licenses * scale)),
    })),
    recommendations: baseRecs.map((r) => ({
      ...r,
      id: `${customerId}-${r.id}`,
    })),
    allowedCatalogs: customer.config?.allowedCatalogs || ["microsoft-365"],
    securityPosture,
  };
}

const CATALOG_MAP = {
  "microsoft-365": microsoft365Catalog,
  "dynamics-365": dynamics365Catalog,
  azure: azureCatalog,
  "server-software": serverSoftwareCatalog,
} as const;

export function getAllowedCatalogProducts(
  customerId: string,
  catalog: keyof typeof CATALOG_MAP
): CatalogProduct[] | { error: string; code: string } {
  const workspace = getTenantWorkspace(customerId);
  if (!workspace) {
    return { error: "Tenant not found", code: "TENANT_NOT_FOUND" };
  }
  if (!workspace.allowedCatalogs.includes(catalog)) {
    return {
      error: "This catalog is not enabled for your tenant. Contact netrichtechnologies Super Admin.",
      code: "CATALOG_DENIED",
    };
  }
  return CATALOG_MAP[catalog];
}
