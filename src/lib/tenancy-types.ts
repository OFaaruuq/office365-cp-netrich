export type PortalRole =
  | "partner_admin"
  | "support_technical"
  | "support_billing"
  | "customer_admin";

export type SupportTeam = "technical" | "billing";

export type CustomerStatus = "pending" | "active" | "suspended" | "rejected";

export interface PartnerOrg {
  id: string;
  name: string;
  slug: string;
  domain: string;
}

export interface ClientTenantConfig {
  /** Portal login allowed for client admins */
  portalAccessEnabled: boolean;
  /** Graph / directory sync enabled */
  syncEnabled: boolean;
  /** GDAP / partner relationship configured */
  gdapEnabled: boolean;
  /** Catalogs the client may purchase */
  allowedCatalogs: Array<"microsoft-365" | "dynamics-365" | "azure" | "server-software">;
  billingContactEmail: string;
  technicalContactEmail: string;
  notes: string;
}

export interface ClientTenant {
  id: string;
  name: string;
  domain: string;
  microsoftTenantId: string;
  status: CustomerStatus;
  adminEmail: string;
  usersCount: number;
  subscriptionsCount: number;
  monthlySpend: number;
  createdAt: string;
  lastSyncAt: string;
  /** Only Super Admin (Netrich) creates tenants — never client self-signup */
  createdByPartner: boolean;
  approvedAt?: string;
  approvedBy?: string;
  configuredAt?: string;
  config: ClientTenantConfig;
}

export interface PortalAccount {
  id: string;
  name: string;
  email: string;
  role: PortalRole;
  /** Set for customer_admin */
  customerId?: string;
  /** Set for support agents */
  team?: SupportTeam;
  title: string;
}

export interface SessionUser {
  accountId: string;
  name: string;
  email: string;
  role: PortalRole;
  customerId?: string;
  customerName?: string;
  team?: SupportTeam;
  title: string;
}

export type ThreadStatus = "queued" | "active" | "resolved";

export type ThreadMessageSender = "client" | "agent" | "system";

export interface ThreadMessage {
  id: string;
  sender: ThreadMessageSender;
  senderName: string;
  text: string;
  createdAt: string;
  readByClient: boolean;
  readByAgent: boolean;
}

export interface SupportThread {
  id: string;
  customerId: string;
  customerName: string;
  clientUserId: string;
  clientUserName: string;
  clientUserEmail: string;
  team: SupportTeam;
  status: ThreadStatus;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  subject: string;
  messages: ThreadMessage[];
  createdAt: string;
  updatedAt: string;
}

export function roleHomePath(role: PortalRole): string {
  switch (role) {
    case "partner_admin":
      return "/admin";
    case "support_technical":
    case "support_billing":
      return "/support";
    case "customer_admin":
    default:
      return "/dashboard";
  }
}

export function roleLabel(role: PortalRole): string {
  switch (role) {
    case "partner_admin":
      return "Partner Admin";
    case "support_technical":
      return "Technical Support";
    case "support_billing":
      return "Billing Support";
    case "customer_admin":
      return "Client Admin";
  }
}
