import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import path from "path";
import { randomBytes } from "crypto";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "portal-sessions.json");

type SessionRow = {
  sid: string;
  accountId: string;
  exp: number;
  revokedAt?: number;
};

type Store = Record<string, SessionRow>;

let cache: { at: number; data: Store } | null = null;

function atomicWrite(filePath: string, contents: string) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, filePath);
}

function load(): Store {
  if (cache && Date.now() - cache.at < 1000) return cache.data;
  try {
    if (!existsSync(FILE)) {
      cache = { at: Date.now(), data: {} };
      return cache.data;
    }
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as Store;
    const data = parsed && typeof parsed === "object" ? parsed : {};
    cache = { at: Date.now(), data };
    return data;
  } catch {
    cache = { at: Date.now(), data: {} };
    return cache.data;
  }
}

function save(data: Store) {
  const now = Math.floor(Date.now() / 1000);
  for (const [k, row] of Object.entries(data)) {
    if (row.exp < now - 86400) delete data[k];
  }
  cache = { at: Date.now(), data };
  atomicWrite(FILE, JSON.stringify(data));
}

export function issueSessionId(): string {
  return randomBytes(16).toString("hex");
}

export function registerSession(sid: string, accountId: string, exp: number) {
  const data = load();
  data[sid] = { sid, accountId, exp };
  save(data);
}

export function isSessionActive(sid: string | undefined | null): boolean {
  if (!sid) return false;
  const row = load()[sid];
  if (!row || row.revokedAt) return false;
  if (row.exp < Math.floor(Date.now() / 1000)) return false;
  return true;
}

export function revokeSession(sid: string | undefined | null) {
  if (!sid) return;
  const data = load();
  if (!data[sid]) return;
  data[sid] = { ...data[sid], revokedAt: Math.floor(Date.now() / 1000) };
  save(data);
}

export function revokeSessionsForAccount(accountId: string) {
  const data = load();
  const now = Math.floor(Date.now() / 1000);
  let changed = false;
  for (const row of Object.values(data)) {
    if (row.accountId === accountId && !row.revokedAt) {
      row.revokedAt = now;
      changed = true;
    }
  }
  if (changed) save(data);
}
