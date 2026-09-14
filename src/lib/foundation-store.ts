import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import path from "path";
import { loadCustomers } from "@/lib/customer-store";
import { DEMO_CUSTOMER_IDS } from "@/lib/tenancy-data";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "foundation.json");

export type OnboardingStepKey =
  | "customer_created"
  | "microsoft_tenant_identified"
  | "csp_relationship"
  | "gdap_relationship"
  | "customer_accepted"
  | "application_consent"
  | "permissions_verified"
  | "graph_sync"
  | "partner_center_sync"
  | "pricing_configured"
  | "client_admin_created"
  | "portal_activated";

export const ONBOARDING_STEPS: OnboardingStepKey[] = [
  "customer_created",
  "microsoft_tenant_identified",
  "csp_relationship",
  "gdap_relationship",
  "customer_accepted",
  "application_consent",
  "permissions_verified",
  "graph_sync",
  "partner_center_sync",
  "pricing_configured",
  "client_admin_created",
  "portal_activated",
];

export type GdapRecord = {
  id: string;
  customerId: string;
  microsoftRelationshipId: string;
  displayName: string;
  status: string;
  activatedAt?: string;
  expiresAt?: string;
  durationDays?: number;
  autoExtend?: boolean;
  roles: Array<{ roleDefinitionId: string; roleName: string }>;
};

export type FoundationFile = {
  gdap: GdapRecord[];
  onboarding: Record<string, Partial<Record<OnboardingStepKey, boolean>>>;
  flags: Array<{ key: string; description: string; enabledGlobal: boolean }>;
  adminAccess: Array<{
    id: string;
    actorUserId: string;
    customerId: string;
    reason: string;
    readOnly: boolean;
    startedAt: string;
    expiresAt: string;
    endedAt?: string;
  }>;
  auditExtra: Array<Record<string, unknown>>;
};

function atomicWrite(filePath: string, contents: string) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, filePath);
}

function defaultFlags() {
  return [
    { key: "partner_control_center", description: "Partner Control Center nav", enabledGlobal: true },
    { key: "customer_nav_v2", description: "Customer portal nav v2", enabledGlobal: true },
    { key: "azure_management", description: "Azure CSP management", enabledGlobal: true },
    { key: "security_center", description: "Expanded security center", enabledGlobal: true },
    { key: "license_optimizer", description: "License optimization", enabledGlobal: false },
    { key: "new_checkout", description: "NCE checkout", enabledGlobal: false },
    { key: "support_v2", description: "SLA support", enabledGlobal: false },
  ];
}

function ensureSeed(data: FoundationFile): FoundationFile {
  if (!data.flags?.length) data.flags = defaultFlags();
  if (!data.gdap) data.gdap = [];
  data.gdap = data.gdap.filter(
    (g) =>
      !DEMO_CUSTOMER_IDS.has(g.customerId) &&
      !/^GDAP-CUST-/i.test(g.microsoftRelationshipId) &&
      g.microsoftRelationshipId !== "GDAP-DEMO-001"
  );
  if (!data.onboarding) data.onboarding = {};
  if (!data.adminAccess) data.adminAccess = [];
  if (!data.auditExtra) data.auditExtra = [];

  const customers = loadCustomers();
  for (const c of customers) {
    if (!data.onboarding[c.id]) {
      data.onboarding[c.id] = {
        customer_created: true,
        microsoft_tenant_identified: Boolean(c.microsoftTenantId),
        gdap_relationship: Boolean(c.config?.gdapEnabled),
        graph_sync: Boolean(c.config?.syncEnabled),
        portal_activated: c.status === "active" && Boolean(c.config?.portalAccessEnabled),
        client_admin_created: Boolean(c.adminEmail),
      };
    }
    // GDAP rows are created from Partner Center / admin actions — never invented here.
  }
  return data;
}

export function loadFoundation(): FoundationFile {
  try {
    if (!existsSync(FILE)) {
      const seeded = ensureSeed({
        gdap: [],
        onboarding: {},
        flags: defaultFlags(),
        adminAccess: [],
        auditExtra: [],
      });
      atomicWrite(FILE, JSON.stringify(seeded, null, 2));
      return seeded;
    }
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as FoundationFile;
    return ensureSeed(parsed);
  } catch {
    return ensureSeed({
      gdap: [],
      onboarding: {},
      flags: defaultFlags(),
      adminAccess: [],
      auditExtra: [],
    });
  }
}

export function saveFoundation(data: FoundationFile) {
  atomicWrite(FILE, JSON.stringify(data, null, 2));
}

export function summarizeOnboarding(customerId: string) {
  const data = loadFoundation();
  const map = data.onboarding[customerId] || {};
  const steps = ONBOARDING_STEPS.map((key) => ({
    key,
    completed: Boolean(map[key]),
    completedAt: map[key] ? new Date().toISOString() : null,
  }));
  const completed = steps.filter((s) => s.completed).length;
  return {
    steps,
    completed,
    total: ONBOARDING_STEPS.length,
    percent: Math.round((completed / ONBOARDING_STEPS.length) * 100),
  };
}

export function formatGdap(g: GdapRecord) {
  const remainingDays = g.expiresAt
    ? Math.ceil((new Date(g.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  return { ...g, remainingDays };
}

export function platformHealthLocal() {
  return {
    ok: true,
    service: "netrich-next-bff",
    stage: "foundation",
    postgres: "not_configured",
    redis: "not_configured",
    workers: "local-inline",
    nestApi: "try http://localhost:8080/health when Docker/Postgres is running",
    microsoft: [
      { component: "key_vault", status: "not_configured" },
      { component: "partner_center", status: "not_configured", detail: "Read-only when PARTNER_CENTER_* env is set" },
      { component: "microsoft_graph", status: "not_configured", detail: "Live when GRAPH_* env is set" },
      { component: "secure_application_model", status: "not_configured" },
    ],
    timestamp: new Date().toISOString(),
  };
}
