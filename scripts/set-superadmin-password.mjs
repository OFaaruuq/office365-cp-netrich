#!/usr/bin/env node
/**
 * Super Admin password create / reset (scrypt, same format as src/lib/auth/password-store.ts)
 *
 * Usage:
 *   node scripts/set-superadmin-password.mjs                 # interactive prompt
 *   node scripts/set-superadmin-password.mjs "YourPass123"   # set password
 *   node scripts/set-superadmin-password.mjs --clear         # remove custom password (falls back to demo)
 *   node scripts/set-superadmin-password.mjs --generate      # create random password + set it
 *   node scripts/set-superadmin-password.mjs --email other@x.com "Pass"
 *   node scripts/set-superadmin-password.mjs --reset-mfa     # also clear MFA enrollment
 *
 * Default account: admin@netrichtechnologies.com (acc-partner-admin)
 */
import { randomBytes, scryptSync } from "crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, ".data");
const PASSWORDS_FILE = path.join(DATA_DIR, "account-passwords.json");
const ACCOUNTS_FILE = path.join(DATA_DIR, "portal-accounts.json");
const MFA_FILE = path.join(DATA_DIR, "mfa-secrets.json");

const DEFAULT_EMAIL = "admin@netrichtechnologies.com";
const DEFAULT_ID = "acc-partner-admin";
const SEED_PARTNER = {
  id: DEFAULT_ID,
  name: "Netrich Super Admin",
  email: DEFAULT_EMAIL,
  role: "partner_admin",
  title: "Super Administrator",
};

function atomicWrite(filePath, contents) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, filePath);
}

function loadJson(file, fallback) {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function resolveAccount(email) {
  const needle = email.trim().toLowerCase();
  const dynamic = loadJson(ACCOUNTS_FILE, []);
  const list = Array.isArray(dynamic) ? dynamic : [];
  const found = list.find((a) => a.email?.toLowerCase() === needle);
  if (found) return found;
  if (needle === DEFAULT_EMAIL) return SEED_PARTNER;
  return null;
}

function ensurePartnerAccount(account) {
  if (account.role !== "partner_admin") {
    console.error(`Refusing: ${account.email} is role "${account.role}" (expected partner_admin).`);
    process.exit(1);
  }
  // Persist seed partner into portal-accounts if missing (so UI/admin lists see it)
  const dynamic = loadJson(ACCOUNTS_FILE, []);
  const list = Array.isArray(dynamic) ? [...dynamic] : [];
  if (!list.some((a) => a.id === account.id || a.email?.toLowerCase() === account.email.toLowerCase())) {
    list.push({ ...account, disabled: false, deleted: false });
    atomicWrite(ACCOUNTS_FILE, JSON.stringify(list, null, 2));
    console.log(`Created portal account record: ${account.email}`);
  }
}

function setPassword(accountId, password, updatedBy = "cli-set-superadmin-password") {
  if (!password || password.trim().length < 6) {
    console.error("Password must be at least 6 characters.");
    process.exit(1);
  }
  const all = loadJson(PASSWORDS_FILE, {});
  all[accountId] = {
    accountId,
    hash: hashPassword(password.trim()),
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  atomicWrite(PASSWORDS_FILE, JSON.stringify(all, null, 2));
}

function clearPassword(accountId) {
  const all = loadJson(PASSWORDS_FILE, {});
  if (!all[accountId]) {
    console.log("No custom password stored (already using demo fallback if ALLOW_DEMO_LOGIN).");
    return;
  }
  delete all[accountId];
  atomicWrite(PASSWORDS_FILE, JSON.stringify(all, null, 2));
  console.log("Custom password cleared.");
}

function resetMfa(accountId) {
  const all = loadJson(MFA_FILE, {});
  if (all[accountId]) {
    delete all[accountId];
    if (Object.keys(all).length === 0 && existsSync(MFA_FILE)) {
      unlinkSync(MFA_FILE);
    } else {
      atomicWrite(MFA_FILE, JSON.stringify(all, null, 2));
    }
    console.log("MFA enrollment cleared — next login will re-enroll TOTP.");
  } else {
    console.log("No MFA secret found for this account.");
  }
}

function generatePassword(length = 16) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const stdin = process.stdin;
    stdin.resume();
    if (stdin.isTTY) stdin.setRawMode(true);
    process.stdout.write(question);
    let input = "";
    const onData = (buf) => {
      const s = buf.toString("utf8");
      if (s === "\n" || s === "\r" || s === "\u0004") {
        if (stdin.isTTY) stdin.setRawMode(false);
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        rl.close();
        resolve(input);
        return;
      }
      if (s === "\u0003") process.exit(130);
      if (s === "\u007f" || s === "\b") {
        input = input.slice(0, -1);
        return;
      }
      input += s;
      process.stdout.write("*");
    };
    stdin.on("data", onData);
  });
}

function parseArgs(argv) {
  const flags = {
    clear: false,
    generate: false,
    resetMfa: false,
    email: DEFAULT_EMAIL,
    password: null,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--clear") flags.clear = true;
    else if (a === "--generate") flags.generate = true;
    else if (a === "--reset-mfa") flags.resetMfa = true;
    else if (a === "--email") flags.email = argv[++i] || DEFAULT_EMAIL;
    else if (a === "--help" || a === "-h") flags.help = true;
    else if (a.startsWith("-")) {
      console.error(`Unknown flag: ${a}`);
      process.exit(1);
    } else positional.push(a);
  }
  if (positional[0]) flags.password = positional[0];
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(`Super Admin password create/reset (scrypt)

  node scripts/set-superadmin-password.mjs
  node scripts/set-superadmin-password.mjs "NewPassword"
  node scripts/set-superadmin-password.mjs --generate
  node scripts/set-superadmin-password.mjs --clear
  node scripts/set-superadmin-password.mjs --reset-mfa --generate
  node scripts/set-superadmin-password.mjs --email admin@netrichtechnologies.com "Pass"`);
    process.exit(0);
  }

  const account = resolveAccount(flags.email);
  if (!account) {
    console.error(`Account not found for email: ${flags.email}`);
    process.exit(1);
  }
  ensurePartnerAccount(account);

  if (flags.clear) {
    clearPassword(account.id);
    if (flags.resetMfa) resetMfa(account.id);
    console.log(`Done for ${account.email} (${account.id}).`);
    return;
  }

  let password = flags.password;
  if (flags.generate) {
    password = generatePassword(18);
  }
  if (!password) {
    password = await promptHidden("New Super Admin password: ");
    const confirm = await promptHidden("Confirm password: ");
    if (password !== confirm) {
      console.error("Passwords do not match.");
      process.exit(1);
    }
  }

  setPassword(account.id, password);
  if (flags.resetMfa) resetMfa(account.id);

  console.log("");
  console.log("Super Admin password updated (scrypt → .data/account-passwords.json)");
  console.log(`  Email: ${account.email}`);
  console.log(`  Id:    ${account.id}`);
  if (flags.generate) {
    console.log(`  Pass:  ${password}`);
    console.log("  (copy now — it will not be shown again)");
  }
  console.log("");
  console.log("Sign in at / with this email + password, then complete MFA.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
