import type { ClientTenant, ClientTenantConfig, PartnerOrg, PortalAccount } from "./tenancy-types";

export const PARTNER: PartnerOrg = {
  id: "partner-netrich",
  name: "netrichtechnologies",
  slug: "netrichtechnologies",
  domain: "office365.cp.netrichtechnologies.com",
};

export const ALL_CATALOG_IDS: ClientTenantConfig["allowedCatalogs"] = [
  "microsoft-365",
  "dynamics-365",
  "azure",
  "server-software",
];

export const DEFAULT_TENANT_CONFIG: ClientTenantConfig = {
  portalAccessEnabled: false,
  syncEnabled: false,
  gdapEnabled: false,
  /** Clients may browse and request purchase from every catalog */
  allowedCatalogs: [...ALL_CATALOG_IDS],
  billingContactEmail: "",
  technicalContactEmail: "",
  notes: "",
};

/** Legacy fixture IDs — never re-seed; stripped from live `.data` on load. */
export const DEMO_CUSTOMER_IDS = new Set([
  "cust-amtel",
  "cust-orbit",
  "cust-nile",
  "cust-sigma",
  "cust-demo",
]);

export const DEMO_ACCOUNT_IDS = new Set([
  "acc-client-amtel",
  "acc-client-orbit",
  "acc-tech-sara",
  "acc-tech-omar",
  "acc-bill-lina",
  "acc-bill-alex",
]);

export const DEMO_ACCOUNT_EMAILS = new Set([
  "sara.technical@netrichtechnologies.com",
  "omar.technical@netrichtechnologies.com",
  "lina.billing@netrichtechnologies.com",
  "alex.billing@netrichtechnologies.com",
  "admin@amtelkom.onmicrosoft.com",
  "admin@orbitdigital.onmicrosoft.com",
  "admin@demo.example.com",
]);

/** Customers come from Super Admin onboarding / Partner Center — never from fixtures. */
export const CLIENT_TENANTS: ClientTenant[] = [];

/** Bootstrap partner Super Admin only. Staff and clients are provisioned in the portal. */
export const PORTAL_ACCOUNTS: PortalAccount[] = [
  {
    id: "acc-partner-admin",
    name: "Netrich Super Admin",
    email: "admin@netrichtechnologies.com",
    role: "partner_admin",
    title: "Super Administrator",
  },
];

export function isDemoCustomerId(id: string | undefined | null): boolean {
  return Boolean(id && DEMO_CUSTOMER_IDS.has(id));
}

export function isDemoAccount(account: { id?: string; email?: string; customerId?: string }): boolean {
  if (account.id && DEMO_ACCOUNT_IDS.has(account.id)) return true;
  if (account.customerId && DEMO_CUSTOMER_IDS.has(account.customerId)) return true;
  if (account.email && DEMO_ACCOUNT_EMAILS.has(account.email.trim().toLowerCase())) return true;
  return false;
}

export function getCustomer(id: string) {
  return CLIENT_TENANTS.find((c) => c.id === id);
}

export function getAccount(id: string) {
  return PORTAL_ACCOUNTS.find((a) => a.id === id);
}
