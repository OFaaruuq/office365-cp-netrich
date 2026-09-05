export type UserStatus = "active" | "pending" | "blocked" | "error";

export interface PortalUser {
  id: string;
  displayName: string;
  email: string;
  status: UserStatus;
  licenses: string[];
  syncedFromGraph: boolean;
  lastSyncedAt?: string;
}

export interface Subscription {
  id: string;
  name: string;
  description: string;
  category: "business" | "enterprise" | "addon";
  purchased: number;
  used: number;
  available: number;
  billingCycle: "Monthly" | "Annual" | "Triennial";
  commitment: "Annual" | "Monthly" | "Triennial";
  price: number;
  nextRenewal: string;
  hasAlert?: boolean;
  skuId?: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  description: string;
  category: string;
  catalog: "microsoft-365" | "dynamics-365" | "server-software" | "azure";
  status: "purchased" | "available" | "not-purchased";
  qty: number;
  priceMonthly: number;
  priceYearly: number | null;
  attachMonthly?: number | null;
  attachYearly?: number | null;
  compatibleAddons?: boolean;
  filters: string[];
}

export interface RenewalItem {
  id: string;
  productName: string;
  licenses: number;
  commitment: string;
  billing: string;
  renewalDate: string;
}

export interface UserRollup {
  active: number;
  pending: number;
  blocked: number;
  error: number;
}

export interface CostSummary {
  monthly: number;
  yearly: number;
  triennially: number;
}

export interface ProductRecommendation {
  id: string;
  name: string;
  status: string;
  initials: string;
}
