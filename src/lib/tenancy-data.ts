import type { ClientTenant, ClientTenantConfig, PartnerOrg, PortalAccount } from "./tenancy-types";

export const PARTNER: PartnerOrg = {
  id: "partner-netrich",
  name: "netrichtechnologies",
  slug: "netrichtechnologies",
  domain: "office365.cp.netrichtechnologies.com",
};

export const DEFAULT_TENANT_CONFIG: ClientTenantConfig = {
  portalAccessEnabled: false,
  syncEnabled: false,
  gdapEnabled: false,
  allowedCatalogs: ["microsoft-365"],
  billingContactEmail: "",
  technicalContactEmail: "",
  notes: "",
};

function cfg(
  partial: Partial<ClientTenantConfig> & { portalAccessEnabled?: boolean }
): ClientTenantConfig {
  return { ...DEFAULT_TENANT_CONFIG, ...partial };
}

export const CLIENT_TENANTS: ClientTenant[] = [
  {
    id: "cust-amtel",
    name: "Amtelkom",
    domain: "amtelkom.onmicrosoft.com",
    microsoftTenantId: "11111111-aaaa-4bbb-8ccc-111111111111",
    status: "active",
    adminEmail: "admin@amtelkom.onmicrosoft.com",
    usersCount: 189,
    subscriptionsCount: 2,
    monthlySpend: 666.02,
    createdAt: "2025-03-12T10:00:00Z",
    lastSyncAt: "2026-09-02T08:00:00Z",
    createdByPartner: true,
    approvedAt: "2025-03-14T10:00:00Z",
    approvedBy: "admin@netrichtechnologies.com",
    configuredAt: "2025-03-14T10:00:00Z",
    config: cfg({
      portalAccessEnabled: true,
      syncEnabled: true,
      gdapEnabled: true,
      allowedCatalogs: ["microsoft-365", "dynamics-365", "azure"],
      billingContactEmail: "billing@amtelkom.onmicrosoft.com",
      technicalContactEmail: "admin@amtelkom.onmicrosoft.com",
      notes: "Production CSP customer — approved by Netrich Super Admin",
    }),
  },
  {
    id: "cust-orbit",
    name: "Orbit Digital",
    domain: "orbitdigital.onmicrosoft.com",
    microsoftTenantId: "22222222-aaaa-4bbb-8ccc-222222222222",
    status: "active",
    adminEmail: "admin@orbitdigital.onmicrosoft.com",
    usersCount: 42,
    subscriptionsCount: 3,
    monthlySpend: 312.4,
    createdAt: "2025-07-01T10:00:00Z",
    lastSyncAt: "2026-09-01T18:20:00Z",
    createdByPartner: true,
    approvedAt: "2025-07-03T10:00:00Z",
    approvedBy: "admin@netrichtechnologies.com",
    configuredAt: "2025-07-03T10:00:00Z",
    config: cfg({
      portalAccessEnabled: true,
      syncEnabled: true,
      gdapEnabled: true,
      allowedCatalogs: ["microsoft-365", "azure"],
      billingContactEmail: "finance@orbitdigital.onmicrosoft.com",
      technicalContactEmail: "admin@orbitdigital.onmicrosoft.com",
      notes: "Approved and configured by Netrich",
    }),
  },
  {
    id: "cust-nile",
    name: "Nile Commerce",
    domain: "nilecommerce.onmicrosoft.com",
    microsoftTenantId: "33333333-aaaa-4bbb-8ccc-333333333333",
    status: "pending",
    adminEmail: "it@nilecommerce.onmicrosoft.com",
    usersCount: 0,
    subscriptionsCount: 0,
    monthlySpend: 0,
    createdAt: "2026-08-20T10:00:00Z",
    lastSyncAt: "2026-08-20T10:00:00Z",
    createdByPartner: true,
    config: cfg({
      portalAccessEnabled: false,
      syncEnabled: false,
      gdapEnabled: false,
      billingContactEmail: "it@nilecommerce.onmicrosoft.com",
      technicalContactEmail: "it@nilecommerce.onmicrosoft.com",
      notes: "Awaiting Netrich Super Admin approval & configuration",
    }),
  },
  {
    id: "cust-sigma",
    name: "Sigma Health",
    domain: "sigmahealth.onmicrosoft.com",
    microsoftTenantId: "44444444-aaaa-4bbb-8ccc-444444444444",
    status: "suspended",
    adminEmail: "admin@sigmahealth.onmicrosoft.com",
    usersCount: 76,
    subscriptionsCount: 4,
    monthlySpend: 980.0,
    createdAt: "2024-11-05T10:00:00Z",
    lastSyncAt: "2026-07-15T12:00:00Z",
    createdByPartner: true,
    approvedAt: "2024-11-10T10:00:00Z",
    approvedBy: "admin@netrichtechnologies.com",
    configuredAt: "2024-11-10T10:00:00Z",
    config: cfg({
      portalAccessEnabled: false,
      syncEnabled: false,
      gdapEnabled: true,
      allowedCatalogs: ["microsoft-365"],
      billingContactEmail: "ap@sigmahealth.onmicrosoft.com",
      technicalContactEmail: "admin@sigmahealth.onmicrosoft.com",
      notes: "Suspended by Netrich Super Admin — billing hold",
    }),
  },
];

/** Demo login personas — clients cannot create tenants */
export const PORTAL_ACCOUNTS: PortalAccount[] = [
  {
    id: "acc-partner-admin",
    name: "Netrich Super Admin",
    email: "admin@netrichtechnologies.com",
    role: "partner_admin",
    title: "Super Administrator",
  },
  {
    id: "acc-tech-sara",
    name: "Sara Hassan",
    email: "sara.technical@netrichtechnologies.com",
    role: "support_technical",
    team: "technical",
    title: "Technical Support",
  },
  {
    id: "acc-tech-omar",
    name: "Omar Khalil",
    email: "omar.technical@netrichtechnologies.com",
    role: "support_technical",
    team: "technical",
    title: "Technical Support",
  },
  {
    id: "acc-bill-lina",
    name: "Lina Farouk",
    email: "lina.billing@netrichtechnologies.com",
    role: "support_billing",
    team: "billing",
    title: "Billing Support",
  },
  {
    id: "acc-bill-alex",
    name: "Alex Nader",
    email: "alex.billing@netrichtechnologies.com",
    role: "support_billing",
    team: "billing",
    title: "Billing Support",
  },
  {
    id: "acc-client-amtel",
    name: "Amtelkom Admin",
    email: "admin@amtelkom.onmicrosoft.com",
    role: "customer_admin",
    customerId: "cust-amtel",
    title: "Client Administrator",
  },
  {
    id: "acc-client-orbit",
    name: "Orbit Admin",
    email: "admin@orbitdigital.onmicrosoft.com",
    role: "customer_admin",
    customerId: "cust-orbit",
    title: "Client Administrator",
  },
];

export function getCustomer(id: string) {
  return CLIENT_TENANTS.find((c) => c.id === id);
}

export function getAccount(id: string) {
  return PORTAL_ACCOUNTS.find((a) => a.id === id);
}
