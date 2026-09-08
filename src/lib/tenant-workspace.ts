import {
  recommendations as baseRecs,
  renewals as baseRenewals,
  subscriptions as baseSubs,
  userRollup as baseRollup,
  users as baseUsers,
} from "@/lib/mock-data";
import { findCustomer } from "@/lib/customer-store";
import { listCatalogProducts } from "@/lib/catalog-store";
import {
  listTenantSubscriptions,
  seedTenantSubscriptionsIfEmpty,
  type TenantSubscription,
} from "@/lib/subscription-store";
import type { CatalogProduct, PortalUser, Subscription } from "@/lib/types";

export type TenantWorkspace = {
  customerId: string;
  domain: string;
  name: string;
  users: PortalUser[];
  userRollup: typeof baseRollup;
  subscriptions: Subscription[];
  costSummary: { monthly: number; yearly: number; triennially: number };
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
  /** Isolated solution-path adoption for this tenant only */
  solutions: {
    collaboration: {
      teamsActiveUsers: number;
      sharePointSites: number;
      meetings30d: number;
    };
    emailData: {
      mailboxes: number;
      oneDriveGB: number;
      sharePointGB: number;
    };
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

  const generatedSubs = baseSubs
    .map((s, idx) => {
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
        hasAlert: customerId === "cust-amtel" ? s.hasAlert : idx === 1 && customerId === "cust-sigma",
      };
    })
    .filter((s) => s.purchased > 0);

  const seedRows: TenantSubscription[] = generatedSubs.map((s) => {
    const baseId = s.id.replace(`${customerId}-`, "");
    const productId =
      baseId === "sub1" ? "m365-1" : baseId === "sub2" ? "m365-2" : s.skuId || baseId;
    return {
      ...s,
      customerId,
      productId,
      catalog: "microsoft-365",
      unitPriceMonthly: s.purchased > 0 ? Number((s.price / s.purchased).toFixed(2)) : s.price,
      purchasedAt: customer.lastSyncAt || new Date().toISOString(),
      purchasedBy: "system-seed",
    };
  });

  const subscriptions = seedTenantSubscriptionsIfEmpty(customerId, seedRows);
  const monthly = Number(subscriptions.reduce((n, s) => n + s.price, 0).toFixed(2));

  // Deterministic per-tenant security metrics (isolated, not global)
  const hash = customerId.split("").reduce((n, ch) => n + ch.charCodeAt(0), 0);
  const securityPosture = {
    mfaPercent: Math.min(99, 70 + (hash % 25)),
    threatEvents30d: hash % 17,
    secureScore: Math.min(95, 55 + (hash % 35)),
    lastAssessedAt: customer.lastSyncAt || new Date().toISOString(),
  };

  const solutions = {
    collaboration: {
      teamsActiveUsers: Math.max(1, Math.round(active * 0.85)),
      sharePointSites: Math.max(1, Math.round(3 + (hash % 12) * scale)),
      meetings30d: Math.max(0, Math.round(20 + (hash % 80) * scale)),
    },
    emailData: {
      mailboxes: Math.max(1, active + blocked),
      oneDriveGB: Math.max(10, Math.round(customer.usersCount * 12 * scale) || 48),
      sharePointGB: Math.max(5, Math.round(40 + (hash % 200) * scale)),
    },
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
    allowedCatalogs: customer.config?.allowedCatalogs?.length
      ? customer.config.allowedCatalogs
      : ["microsoft-365", "dynamics-365", "azure", "server-software"],
    securityPosture,
    solutions,
  };
}

const CATALOG_IDS = [
  "microsoft-365",
  "dynamics-365",
  "azure",
  "server-software",
] as const;

/** All product catalogs are visible to every active client tenant. */
export const ALL_PRODUCT_CATALOGS = CATALOG_IDS;

export function getAllowedCatalogProducts(
  customerId: string,
  catalog: (typeof CATALOG_IDS)[number]
): CatalogProduct[] | { error: string; code: string } {
  const workspace = getTenantWorkspace(customerId);
  if (!workspace) {
    return { error: "Tenant not found", code: "TENANT_NOT_FOUND" };
  }

  const owned = listTenantSubscriptions(customerId);
  const byProduct = new Map(owned.map((s) => [s.productId, s]));

  return listCatalogProducts({ catalog, activeOnly: true }).map((p) => {
    const sub = byProduct.get(p.id);
    return {
      ...p,
      status: sub && sub.purchased > 0 ? ("purchased" as const) : ("available" as const),
      qty: sub?.purchased || 0,
    };
  });
}
