import type { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { PortalRole, SessionUser, SupportTeam } from "@/lib/tenancy-types";

export const SESSION_COOKIE = "nt_portal_session";
const MAX_AGE_SEC = 60 * 60 * 12; // 12 hours

function secret(): string {
  return (
    process.env.PORTAL_SESSION_SECRET ||
    process.env.SESSION_SECRET ||
    "netrich-office365-dev-session-secret-change-me"
  );
}

export type ServerSession = {
  accountId: string;
  name: string;
  email: string;
  role: PortalRole;
  customerId?: string;
  customerName?: string;
  team?: SupportTeam;
  title: string;
  iat: number;
  exp: number;
};

function b64urlFromBytes(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  for (let i = 0; i < u8.length; i++) str += String.fromCharCode(u8[i]!);
  const b64 =
    typeof btoa === "function"
      ? btoa(str)
      : Buffer.from(u8).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlFromString(input: string): string {
  const bytes = new TextEncoder().encode(input);
  return b64urlFromBytes(bytes);
}

function bytesFromB64url(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

async function hmacSign(payloadB64: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadB64)
  );
  return b64urlFromBytes(sig);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function encodeSessionToken(
  session: Omit<ServerSession, "iat" | "exp">
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const full: ServerSession = {
    ...session,
    iat: now,
    exp: now + MAX_AGE_SEC,
  };
  const payloadB64 = b64urlFromString(JSON.stringify(full));
  const sig = await hmacSign(payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function decodeSessionToken(
  token: string | undefined | null
): Promise<ServerSession | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  try {
    const expected = await hmacSign(payloadB64);
    if (!timingSafeEqualStr(sig, expected)) return null;
    const json = new TextDecoder().decode(bytesFromB64url(payloadB64));
    const session = JSON.parse(json) as ServerSession;
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
    if (!session.accountId || !session.role || !session.email) return null;
    return session;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge = MAX_AGE_SEC) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function applySessionCookie(
  res: NextResponse,
  session: Omit<ServerSession, "iat" | "exp">
) {
  const token = await encodeSessionToken(session);
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  return res;
}

export async function readSessionFromRequest(
  request: NextRequest
): Promise<ServerSession | null> {
  return decodeSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
}

export async function readSessionFromCookies(): Promise<ServerSession | null> {
  const jar = await cookies();
  return decodeSessionToken(jar.get(SESSION_COOKIE)?.value);
}

export function toClientSession(s: ServerSession): SessionUser {
  return {
    accountId: s.accountId,
    name: s.name,
    email: s.email,
    role: s.role,
    customerId: s.customerId,
    customerName: s.customerName,
    team: s.team,
    title: s.title,
  };
}
