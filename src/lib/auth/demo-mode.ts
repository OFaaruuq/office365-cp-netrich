/**
 * Production session secret helpers.
 * Credential/TOTP demo login is not part of this product.
 */
import { DEV_SESSION_SECRET, isProductionRuntime } from "@/lib/auth/runtime";

export function hasHardenedSessionSecret(): boolean {
  const s = process.env.PORTAL_SESSION_SECRET || process.env.SESSION_SECRET;
  return Boolean(s && s.length >= 32 && s !== DEV_SESSION_SECRET);
}

export function requireHardenedSessionSecret(): void {
  if (isProductionRuntime() && !hasHardenedSessionSecret()) {
    throw new Error(
      "PORTAL_SESSION_SECRET must be set to a strong random value (≥32 chars) in production. Cookie forgery is otherwise trivial."
    );
  }
}

/** First-SSO Super Admin provision. No default mailbox — must be set explicitly. */
export function bootstrapAdminEmail(): string | null {
  const raw = (process.env.PORTAL_BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  if (!raw) return null;
  if (isProductionRuntime() && raw === "admin@netrichtechnologies.com") {
    return null;
  }
  return raw;
}
