/**
 * Per-tenant Microsoft directory users (Foundation SoR overlay).
 * Seeds from workspace mock; mutations persist to .data/directory-users.json.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import type { PortalUser, UserStatus } from "@/lib/types";
import { getTenantWorkspace } from "@/lib/tenant-workspace";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "directory-users.json");

type FileShape = Record<string, PortalUser[]>;

function atomicWrite(filePath: string, contents: string) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, filePath);
}

function loadFile(): FileShape {
  try {
    if (!existsSync(FILE)) return {};
    return JSON.parse(readFileSync(FILE, "utf8")) as FileShape;
  } catch {
    return {};
  }
}

function saveFile(data: FileShape) {
  atomicWrite(FILE, JSON.stringify(data, null, 2));
}

export function listDirectoryUsers(customerId: string): PortalUser[] {
  const file = loadFile();
  if (file[customerId]?.length) return file[customerId];
  const ws = getTenantWorkspace(customerId);
  const seeded = ws?.users || [];
  file[customerId] = seeded;
  saveFile(file);
  return seeded;
}

export function createDirectoryUser(
  customerId: string,
  input: { displayName: string; email: string; licenses?: string[] }
): PortalUser {
  const users = listDirectoryUsers(customerId);
  const user: PortalUser = {
    id: `${customerId}-u-${randomBytes(4).toString("hex")}`,
    displayName: input.displayName.trim(),
    email: input.email.trim().toLowerCase(),
    status: "active",
    licenses: input.licenses || [],
    syncedFromGraph: false,
    lastSyncedAt: new Date().toISOString(),
  };
  const file = loadFile();
  file[customerId] = [user, ...users];
  saveFile(file);
  return user;
}

export function updateDirectoryUser(
  customerId: string,
  userId: string,
  patch: { status?: UserStatus; licenses?: string[]; displayName?: string }
): PortalUser | null {
  const file = loadFile();
  const users = listDirectoryUsers(customerId);
  const idx = users.findIndex((u) => u.id === userId);
  if (idx < 0) return null;
  users[idx] = {
    ...users[idx],
    ...patch,
    lastSyncedAt: new Date().toISOString(),
  };
  file[customerId] = users;
  saveFile(file);
  return users[idx];
}

export function rollupDirectoryUsers(customerId: string) {
  const users = listDirectoryUsers(customerId);
  return {
    active: users.filter((u) => u.status === "active").length,
    pending: users.filter((u) => u.status === "pending").length,
    blocked: users.filter((u) => u.status === "blocked").length,
    error: users.filter((u) => u.status === "error").length,
  };
}
