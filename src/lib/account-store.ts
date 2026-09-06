import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import path from "path";
import { PORTAL_ACCOUNTS } from "@/lib/tenancy-data";
import type { PortalAccount } from "@/lib/tenancy-types";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "portal-accounts.json");

function atomicWrite(filePath: string, contents: string) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, filePath);
}

function loadDynamicAccounts(): PortalAccount[] {
  try {
    if (!existsSync(FILE)) return [];
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as PortalAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDynamicAccounts(accounts: PortalAccount[]) {
  atomicWrite(FILE, JSON.stringify(accounts, null, 2));
}

/**
 * Seed personas + Super-Admin-created accounts.
 * Dynamic records override seed by id (so Super Admin can disable/edit seed client admins).
 */
export function listPortalAccounts(): PortalAccount[] {
  const dynamic = loadDynamicAccounts();
  const byId = new Map<string, PortalAccount>();
  for (const a of PORTAL_ACCOUNTS) byId.set(a.id, a);
  for (const a of dynamic) byId.set(a.id, a);
  return [...byId.values()]
    .filter((a) => !a.deleted)
    .map((a) =>
      a.role === "customer_admin" ? { ...a, title: a.title || "Tenant Super Admin" } : a
    );
}

export function getPortalAccount(id: string): PortalAccount | undefined {
  return listPortalAccounts().find((a) => a.id === id);
}

export function findPortalAccountByEmail(email: string): PortalAccount | undefined {
  const needle = email.trim().toLowerCase();
  return listPortalAccounts().find((a) => a.email.toLowerCase() === needle);
}

export function listClientAdminAccounts(customerId?: string): PortalAccount[] {
  return listPortalAccounts().filter(
    (a) =>
      a.role === "customer_admin" &&
      (!customerId || a.customerId === customerId)
  );
}

function persistOverride(account: PortalAccount) {
  const dynamic = loadDynamicAccounts();
  const idx = dynamic.findIndex((a) => a.id === account.id);
  if (idx >= 0) dynamic[idx] = account;
  else dynamic.push(account);
  saveDynamicAccounts(dynamic);
  return account;
}

/** Create or update the primary client-admin login bound to a tenant */
export function upsertClientAdminAccount(input: {
  customerId: string;
  name: string;
  email: string;
}): PortalAccount {
  const email = input.email.trim();
  const existing =
    listClientAdminAccounts(input.customerId).find(
      (a) => a.email.toLowerCase() === email.toLowerCase()
    ) || listClientAdminAccounts(input.customerId)[0];

  const account: PortalAccount = {
    id: existing?.id || `acc-client-${input.customerId.replace(/^cust-/, "")}-${Date.now().toString(36)}`,
    name: input.name.trim() || `${email} Admin`,
    email,
    role: "customer_admin",
    customerId: input.customerId,
    title: "Tenant Super Admin",
    disabled: existing?.disabled === true,
  };

  return persistOverride(account);
}

/** Super Admin — add another Client Admin on a tenant */
export function createClientAdminAccount(input: {
  customerId: string;
  name: string;
  email: string;
}): PortalAccount | { error: string; code: string } {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name || !email || !email.includes("@")) {
    return { error: "Name and valid email are required.", code: "INVALID_INPUT" };
  }
  if (findPortalAccountByEmail(email)) {
    return { error: "An account with this email already exists.", code: "EMAIL_EXISTS" };
  }

  const account: PortalAccount = {
    id: `acc-client-${input.customerId.replace(/^cust-/, "")}-${Date.now().toString(36)}`,
    name,
    email,
    role: "customer_admin",
    customerId: input.customerId,
    title: "Tenant Super Admin",
    disabled: false,
  };
  return persistOverride(account);
}

export function listStaffAccounts(): PortalAccount[] {
  return listPortalAccounts().filter(
    (a) =>
      a.role === "partner_admin" ||
      a.role === "support_technical" ||
      a.role === "support_billing"
  );
}

/** Super Admin — create another Partner Super Admin or Support agent */
export function createStaffAccount(input: {
  name: string;
  email: string;
  role: "partner_admin" | "support_technical" | "support_billing";
  team?: "technical" | "billing";
}): PortalAccount | { error: string; code: string } {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name || !email || !email.includes("@")) {
    return { error: "Name and valid email are required.", code: "INVALID_INPUT" };
  }
  if (findPortalAccountByEmail(email)) {
    return { error: "An account with this email already exists.", code: "EMAIL_EXISTS" };
  }

  const team =
    input.role === "support_technical"
      ? "technical"
      : input.role === "support_billing"
        ? "billing"
        : undefined;

  const title =
    input.role === "partner_admin"
      ? "Super Administrator"
      : input.role === "support_technical"
        ? "Technical Support"
        : "Billing Support";

  const account: PortalAccount = {
    id: `acc-staff-${Date.now().toString(36)}`,
    name,
    email,
    role: input.role,
    team: input.team || team,
    title,
    disabled: false,
  };
  return persistOverride(account);
}

/** Super Admin — update staff (Partner Super Admin / Support) */
export function updateStaffAccount(input: {
  accountId: string;
  name?: string;
  email?: string;
  disabled?: boolean;
}): PortalAccount | { error: string; code: string } {
  const current = getPortalAccount(input.accountId);
  if (
    !current ||
    (current.role !== "partner_admin" &&
      current.role !== "support_technical" &&
      current.role !== "support_billing")
  ) {
    return { error: "Staff account not found.", code: "NOT_FOUND" };
  }

  // Never disable the last active Partner Super Admin
  if (input.disabled === true && current.role === "partner_admin") {
    const activePartners = listStaffAccounts().filter(
      (a) => a.role === "partner_admin" && !a.disabled && a.id !== current.id
    );
    if (activePartners.length === 0) {
      return {
        error: "Cannot disable the last active Partner Super Admin.",
        code: "LAST_SUPER_ADMIN",
      };
    }
  }

  let email = current.email;
  if (input.email != null) {
    email = input.email.trim().toLowerCase();
    if (!email.includes("@")) {
      return { error: "Invalid email.", code: "INVALID_INPUT" };
    }
    const clash = findPortalAccountByEmail(email);
    if (clash && clash.id !== current.id) {
      return { error: "An account with this email already exists.", code: "EMAIL_EXISTS" };
    }
  }

  const account: PortalAccount = {
    ...current,
    name: input.name != null ? input.name.trim() || current.name : current.name,
    email,
    disabled: input.disabled != null ? Boolean(input.disabled) : Boolean(current.disabled),
  };
  return persistOverride(account);
}

/** Super Admin — update a client admin (any tenant) */
export function updateClientAdminAccount(input: {
  accountId: string;
  name?: string;
  email?: string;
  disabled?: boolean;
}): PortalAccount | { error: string; code: string } {
  const current = getPortalAccount(input.accountId);
  if (!current || current.role !== "customer_admin") {
    return { error: "Client admin not found.", code: "NOT_FOUND" };
  }

  let email = current.email;
  if (input.email != null) {
    email = input.email.trim().toLowerCase();
    if (!email.includes("@")) {
      return { error: "Invalid email.", code: "INVALID_INPUT" };
    }
    const clash = findPortalAccountByEmail(email);
    if (clash && clash.id !== current.id) {
      return { error: "An account with this email already exists.", code: "EMAIL_EXISTS" };
    }
  }

  const account: PortalAccount = {
    ...current,
    name: input.name != null ? input.name.trim() || current.name : current.name,
    email,
    title: "Tenant Super Admin",
    disabled: input.disabled != null ? Boolean(input.disabled) : Boolean(current.disabled),
  };
  return persistOverride(account);
}

/**
 * Super Admin — permanently remove a portal user (Client Admin or staff).
 * Soft-deletes so seed personas stay suppressed. Cannot delete last Super Admin.
 */
export function deletePortalAccount(
  accountId: string
): { ok: true; account: PortalAccount } | { error: string; code: string } {
  const current = getPortalAccount(accountId);
  if (!current) {
    return { error: "Account not found.", code: "NOT_FOUND" };
  }

  if (current.role === "partner_admin") {
    const otherActive = listStaffAccounts().filter(
      (a) => a.role === "partner_admin" && !a.disabled && a.id !== current.id
    );
    if (otherActive.length === 0) {
      return {
        error: "Cannot delete the last active Partner Super Admin.",
        code: "LAST_SUPER_ADMIN",
      };
    }
  }

  persistOverride({
    ...current,
    disabled: true,
    deleted: true,
  });
  return { ok: true, account: current };
}

/** Soft-delete every Client Admin bound to a tenant */
export function deleteClientAdminsForCustomer(customerId: string): PortalAccount[] {
  const removed: PortalAccount[] = [];
  for (const a of listClientAdminAccounts(customerId)) {
    const result = deletePortalAccount(a.id);
    if ("ok" in result) removed.push(result.account);
  }
  return removed;
}
