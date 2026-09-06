/** Fine-grained permissions for CSP platform RBAC */
export const PERMISSIONS = [
  { key: "tenant.read", description: "View customers/tenants" },
  { key: "tenant.create", description: "Create customers" },
  { key: "tenant.suspend", description: "Suspend customers" },
  { key: "tenant.delete", description: "Request delete / terminate" },
  { key: "user.read", description: "View portal/directory users" },
  { key: "user.create", description: "Create users" },
  { key: "user.disable", description: "Disable users" },
  { key: "user.license.assign", description: "Assign licenses" },
  { key: "subscription.read", description: "View subscriptions" },
  { key: "subscription.purchase", description: "Purchase subscriptions" },
  { key: "subscription.quantity.change", description: "Change seats" },
  { key: "subscription.cancel", description: "Cancel subscriptions" },
  { key: "invoice.read", description: "View invoices" },
  { key: "invoice.download", description: "Download invoices" },
  { key: "security.read", description: "View security center" },
  { key: "support.read", description: "View support tickets" },
  { key: "support.respond", description: "Respond to support" },
  { key: "audit.read", description: "View audit logs" },
  { key: "gdap.read", description: "View GDAP" },
  { key: "gdap.manage", description: "Manage GDAP" },
  { key: "platform.admin", description: "Platform administration" },
  { key: "admin.impersonate", description: "View-as-customer" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const ROLE_PACKS: Array<{
  key: string;
  name: string;
  scope: "partner" | "customer";
  permissions: PermissionKey[];
}> = [
  {
    key: "platform_super_admin",
    name: "Platform Super Admin",
    scope: "partner",
    permissions: PERMISSIONS.map((p) => p.key),
  },
  {
    key: "partner_operations_admin",
    name: "Partner Operations Admin",
    scope: "partner",
    permissions: [
      "tenant.read",
      "tenant.create",
      "tenant.suspend",
      "user.read",
      "user.create",
      "subscription.read",
      "gdap.read",
      "gdap.manage",
      "support.read",
      "audit.read",
      "admin.impersonate",
    ],
  },
  {
    key: "partner_billing_admin",
    name: "Partner Billing Admin",
    scope: "partner",
    permissions: ["tenant.read", "subscription.read", "invoice.read", "invoice.download", "audit.read"],
  },
  {
    key: "partner_support_admin",
    name: "Partner Support Admin",
    scope: "partner",
    permissions: ["tenant.read", "user.read", "support.read", "support.respond", "admin.impersonate"],
  },
  {
    key: "partner_security_admin",
    name: "Partner Security Admin",
    scope: "partner",
    permissions: ["tenant.read", "security.read", "audit.read", "gdap.read"],
  },
  {
    key: "partner_read_only",
    name: "Partner Read Only",
    scope: "partner",
    permissions: ["tenant.read", "user.read", "subscription.read", "invoice.read", "security.read"],
  },
  {
    key: "auditor",
    name: "Auditor",
    scope: "partner",
    permissions: ["tenant.read", "audit.read", "security.read"],
  },
  {
    key: "customer_global_admin",
    name: "Customer Global Admin",
    scope: "customer",
    permissions: [
      "user.read",
      "user.create",
      "user.disable",
      "user.license.assign",
      "subscription.read",
      "subscription.purchase",
      "subscription.quantity.change",
      "invoice.read",
      "invoice.download",
      "security.read",
      "support.read",
      "support.respond",
    ],
  },
  {
    key: "customer_user_admin",
    name: "User Administrator",
    scope: "customer",
    permissions: ["user.read", "user.create", "user.disable", "user.license.assign"],
  },
  {
    key: "customer_license_admin",
    name: "License Administrator",
    scope: "customer",
    permissions: ["user.read", "user.license.assign", "subscription.read"],
  },
  {
    key: "customer_billing_admin",
    name: "Billing Administrator",
    scope: "customer",
    permissions: ["subscription.read", "invoice.read", "invoice.download"],
  },
  {
    key: "customer_security_reader",
    name: "Security Reader",
    scope: "customer",
    permissions: ["security.read"],
  },
  {
    key: "customer_helpdesk",
    name: "Helpdesk",
    scope: "customer",
    permissions: ["user.read", "support.read", "support.respond"],
  },
  {
    key: "customer_read_only",
    name: "Customer Read Only",
    scope: "customer",
    permissions: ["user.read", "subscription.read", "invoice.read", "security.read"],
  },
];

/** Map MVP coarse roles → RBAC packs */
export const LEGACY_ROLE_MAP: Record<string, string> = {
  partner_admin: "platform_super_admin",
  support_technical: "partner_support_admin",
  support_billing: "partner_billing_admin",
  customer_admin: "customer_global_admin",
};
