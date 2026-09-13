import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import path from "path";
import { getDemoPassword, isDemoLoginAllowed } from "@/lib/auth/demo-mode";
import { getPortalAccount } from "@/lib/account-store";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "account-passwords.json");

type PasswordFile = Record<
  string,
  {
    accountId: string;
    hash: string; // salt:hexHash
    updatedAt: string;
    updatedBy?: string;
  }
>;

function atomicWrite(filePath: string, contents: string) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, filePath);
}

function loadAll(): PasswordFile {
  try {
    if (!existsSync(FILE)) return {};
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as PasswordFile;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveAll(data: PasswordFile) {
  atomicWrite(FILE, JSON.stringify(data, null, 2));
}

function hashPassword(password: string, salt?: Buffer): string {
  const s = salt || randomBytes(16);
  const hash = scryptSync(password, s, 64);
  return `${s.toString("hex")}:${hash.toString("hex")}`;
}

function verifyHash(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function hasCustomPassword(accountId: string): boolean {
  return Boolean(loadAll()[accountId]?.hash);
}

export function setAccountPassword(
  accountId: string,
  password: string,
  updatedBy?: string
): { ok: true } | { error: string; code: string } {
  const pwd = password.trim();
  if (pwd.length < 12) {
    return { error: "Password must be at least 12 characters.", code: "WEAK_PASSWORD" };
  }
  if (!/[A-Za-z]/.test(pwd) || !/[0-9]/.test(pwd)) {
    return {
      error: "Password must include letters and numbers.",
      code: "WEAK_PASSWORD",
    };
  }
  const all = loadAll();
  all[accountId] = {
    accountId,
    hash: hashPassword(pwd),
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  saveAll(all);
  return { ok: true };
}

export function clearAccountPassword(accountId: string) {
  const all = loadAll();
  delete all[accountId];
  saveAll(all);
}

/**
 * Verify login password:
 * 1) Custom per-account hash (required for every client admin)
 * 2) Shared demo password only for partner_admin in non-production demo mode
 *    — never a cross-tenant client fallback.
 */
export function verifyAccountPassword(accountId: string, password: string): boolean {
  if (!password) return false;
  const rec = loadAll()[accountId];
  if (rec?.hash) {
    return verifyHash(password, rec.hash);
  }
  if (!isDemoLoginAllowed()) return false;
  const account = getPortalAccount(accountId);
  if (account?.role !== "partner_admin") return false;
  return password === getDemoPassword();
}
