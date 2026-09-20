import { createHmac, timingSafeEqual } from "crypto";

export type PortalSessionClaims = {
  accountId: string;
  name: string;
  email: string;
  role: string;
  customerId?: string;
  team?: string;
  title?: string;
  exp: number;
  inspect?: { customerId: string; exp: number; reason?: string; readOnly?: boolean };
};

function secret(): string {
  const configured = process.env.PORTAL_SESSION_SECRET || process.env.SESSION_SECRET || "";
  if (configured.length >= 32 && configured !== "netrich-office365-dev-session-secret-change-me") return configured;
  if (process.env.NODE_ENV === "production") return "";
  return "netrich-office365-dev-session-secret-change-me";
}

function b64urlEncode(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqualStr(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/** Verify Next HMAC portal session. Identity comes from this token, never from spoofable role headers. */
export function decodePortalSessionToken(token?: string | null): PortalSessionClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expected = b64urlEncode(createHmac("sha256", secret()).update(payloadB64).digest());
  if (!timingSafeEqualStr(sig, expected)) return null;
  try {
    const json = Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const session = JSON.parse(json) as PortalSessionClaims;
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
    if (!session.accountId || !session.role || !session.email) return null;
    return session;
  } catch {
    return null;
  }
}
