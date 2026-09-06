import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import path from "path";
import { getDemoPassword } from "@/lib/auth/demo-mode";

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
  if (pwd.length < 6) {
    return { error: "Password must be at least 6 characters.", code: "WEAK_PASSWORD" };
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
 * 1) Custom per-account password if set by Super Admin
 * 2) Otherwise shared demo password (local/dev)
 */
export function verifyAccountPassword(accountId: string, password: string): boolean {
  if (!password) return false;
  const rec = loadAll()[accountId];
  if (rec?.hash) {
    return verifyHash(password, rec.hash);
  }
  return password === getDemoPassword();
}
