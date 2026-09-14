import { findCustomer } from "@/lib/customer-store";
import { listCatalogProducts } from "@/lib/catalog-store";
import { listDirectoryUsers, rollupDirectoryUsers } from "@/lib/directory-store";
import { listTenantSubscriptions } from "@/lib/subscription-store";
import type {
  CatalogProduct,
  PortalUser,
  ProductRecommendation,
  RenewalItem,
  Subscription,
  UserRollup,
} from "@/lib/types";

export type TenantWorkspace = {
  customerId: string;
  domain: string;
  name: string;
  users: PortalUser[];
  userRollup: UserRollup;
  subscriptions: Subscription[];
  costSummary: { monthly: number; yearly: number; triennially: number };
  renewals: RenewalItem[];
  recommendations: ProductRecommendation[];
  allowedCatalogs: Array<"microsoft-365" | "dynamics-365" | "azure" | "server-software">;
  /** Isolated security posture metrics — never shared across tenants */
  securityPosture: {
    mfaPercent: number;
    threatEvents30d: number;
    secureScore: number;
    lastAssessedAt: string;
    source?: string;
  };
  /** Isolated solution-path adoption for this tenant only */
  solutions: {
    collaboration: {
      teamsActiveUsers: number;
      sharePointSites: number;
      meetings30d: number;
      source?: string;
    };
    emailData: {
      mailboxes: number;
      oneDriveGB: number;
      sharePointGB: number;
      source?: string;
    };
  };
};

/** Isolated workspace snapshot — directory + commerce stores only, never mock tenants */
export function getTenantWorkspace(customerId: string): TenantWorkspace | null {
  const customer = findCustomer(customerId);
  if (!customer) return null;

  const users = listDirectoryUsers(customerId);
  const userRollup = rollupDirectoryUsers(customerId);
  const subscriptions = listTenantSubscriptions(customerId);
  const monthly = Number(subscriptions.reduce((n, s) => n + s.price, 0).toFixed(2));
  const active = userRollup.active;
  const blocked = userRollup.blocked;
  const licensed = users.filter((u) => (u.licenses || []).length > 0).length;

  const renewals: RenewalItem[] = subscriptions
    .filter((s) => s.nextRenewal)
    .map((s) => ({
      id: `ren-${s.id}`,
      productName: s.name,
      licenses: s.purchased,
      commitment: s.commitment === "Monthly" ? "Monthly commit" : "Annual commit",
      billing: `Billed ${s.billingCycle}`,
      renewalDate: s.nextRenewal,
    }));

  return {
    customerId,
    domain: customer.domain,
    name: customer.name,
    users,
    userRollup,
    subscriptions,
    costSummary: { monthly, yearly: 0, triennially: 0 },
    renewals,
    recommendations: [],
    allowedCatalogs: customer.config?.allowedCatalogs?.length
      ? customer.config.allowedCatalogs
      : ["microsoft-365", "dynamics-365", "azure", "server-software"],
    securityPosture: {
      mfaPercent: 0,
      threatEvents30d: 0,
      secureScore: 0,
      lastAssessedAt: customer.lastSyncAt || new Date().toISOString(),
      source: "local-unmeasured",
    },
    solutions: {
      collaboration: {
        teamsActiveUsers: licensed || active,
        sharePointSites: 0,
        meetings30d: 0,
        source: "derived-from-directory",
      },
      emailData: {
        mailboxes: active + blocked,
        oneDriveGB: 0,
        sharePointGB: 0,
        source: "derived-from-directory",
      },
    },
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
