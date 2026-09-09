import { randomBytes, createCipheriv, createDecipheriv, createHash } from "crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import path from "path";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "mfa-secrets.json");
const ISSUER = "netrichtechnologies M365 CP";

export type MfaRecord = {
  accountId: string;
  email: string;
  secret: string;
  enabled: boolean;
  enrolledAt?: string;
  updatedAt: string;
};

type MfaFile = Record<string, MfaRecord>;

function atomicWrite(filePath: string, contents: string) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, filePath);
}

function mfaKey(): Buffer {
  const s =
    process.env.PORTAL_SESSION_SECRET ||
    process.env.SESSION_SECRET ||
    "netrich-office365-dev-session-secret-change-me";
  return createHash("sha256").update(`mfa-at-rest:${s}`).digest();
}

function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", mfaKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

function decryptSecret(stored: string): string {
  if (!stored.startsWith("enc:")) return stored;
  const parts = stored.split(":");
  if (parts.length !== 4) return stored;
  const iv = Buffer.from(parts[1]!, "hex");
  const tag = Buffer.from(parts[2]!, "hex");
  const data = Buffer.from(parts[3]!, "hex");
  const decipher = createDecipheriv("aes-256-gcm", mfaKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

function loadAll(): MfaFile {
  try {
    if (!existsSync(FILE)) return {};
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as MfaFile;
    if (!parsed || typeof parsed !== "object") return {};
    const out: MfaFile = {};
    for (const [id, rec] of Object.entries(parsed)) {
      if (!rec?.secret) continue;
      out[id] = { ...rec, secret: decryptSecret(rec.secret) };
    }
    return out;
  } catch {
    return {};
  }
}

function saveAll(data: MfaFile) {
  const persist: MfaFile = {};
  for (const [id, rec] of Object.entries(data)) {
    persist[id] = { ...rec, secret: encryptSecret(rec.secret) };
  }
  atomicWrite(FILE, JSON.stringify(persist, null, 2));
}

export function isMfaEnabled(accountId: string): boolean {
  const rec = loadAll()[accountId];
  return Boolean(rec?.enabled && rec.secret);
}

export function getMfaRecord(accountId: string): MfaRecord | undefined {
  return loadAll()[accountId];
}

function totpFor(secret: string, label: string) {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

/** Create a new authenticator secret (not enabled until user confirms a code) */
export function beginMfaEnrollment(accountId: string, email: string): {
  secret: string;
  otpauthUrl: string;
} {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });

  const all = loadAll();
  const now = new Date().toISOString();
  all[accountId] = {
    accountId,
    email,
    secret: secret.base32,
    enabled: false,
    updatedAt: now,
  };
  saveAll(all);

  return { secret: secret.base32, otpauthUrl: totp.toString() };
}

export async function mfaQrDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 220,
    color: { dark: "#1f1f1f", light: "#ffffff" },
  });
}

export function verifyTotpCode(accountId: string, code: string): boolean {
  const rec = getMfaRecord(accountId);
  if (!rec?.secret) return false;
  const totp = totpFor(rec.secret, rec.email);
  const delta = totp.validate({ token: code.replace(/\s/g, ""), window: 1 });
  return delta !== null;
}

/** Confirm enrollment: code must match pending secret, then enable MFA */
export function confirmMfaEnrollment(accountId: string, code: string): boolean {
  const rec = getMfaRecord(accountId);
  if (!rec?.secret) return false;
  if (!verifyTotpCode(accountId, code)) return false;
  const all = loadAll();
  const now = new Date().toISOString();
  all[accountId] = {
    ...rec,
    enabled: true,
    enrolledAt: now,
    updatedAt: now,
  };
  saveAll(all);
  return true;
}

/** Super Admin only — wipe MFA so the user must re-enroll on next login */
export function resetMfa(accountId: string): boolean {
  const all = loadAll();
  if (!all[accountId]) {
    // Nothing enrolled — still OK (idempotent)
    return true;
  }
  delete all[accountId];
  saveAll(all);
  return true;
}

export function mfaStatusFor(accountId: string): {
  enrolled: boolean;
  enabled: boolean;
  enrolledAt?: string;
} {
  const rec = getMfaRecord(accountId);
  return {
    enrolled: Boolean(rec?.enabled && rec.secret),
    enabled: Boolean(rec?.enabled),
    enrolledAt: rec?.enrolledAt,
  };
}

/** In-memory login challenges (password OK, MFA pending) — short lived */
type Challenge = {
  accountId: string;
  email: string;
  name: string;
  role: string;
  customerId?: string;
  customerName?: string;
  team?: string;
  title: string;
  purpose: "verify" | "enroll";
  pendingSecret?: string;
  expiresAt: number;
};

const challenges = new Map<string, Challenge>();

export function createMfaChallenge(
  input: Omit<Challenge, "expiresAt">,
  ttlMs = 5 * 60 * 1000
): string {
  const id = `mfa-${randomBytes(16).toString("hex")}`;
  challenges.set(id, { ...input, expiresAt: Date.now() + ttlMs });
  // prune occasionally
  if (challenges.size > 200) {
    const now = Date.now();
    for (const [k, v] of challenges) {
      if (v.expiresAt < now) challenges.delete(k);
    }
  }
  return id;
}

export function getMfaChallenge(id: string): Challenge | null {
  const c = challenges.get(id);
  if (!c) return null;
  if (c.expiresAt < Date.now()) {
    challenges.delete(id);
    return null;
  }
  return c;
}

export function consumeMfaChallenge(id: string): Challenge | null {
  const c = getMfaChallenge(id);
  if (!c) return null;
  challenges.delete(id);
  return c;
}

export function updateMfaChallenge(
  id: string,
  patch: Partial<Pick<Challenge, "purpose" | "pendingSecret">>
): Challenge | null {
  const c = getMfaChallenge(id);
  if (!c) return null;
  const next = { ...c, ...patch };
  challenges.set(id, next);
  return next;
}
