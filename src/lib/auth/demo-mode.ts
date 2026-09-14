/**
 * Production session secret helpers.
 * Credential/TOTP demo login is not part of this product.
 */
export function hasHardenedSessionSecret(): boolean {
  const s = process.env.PORTAL_SESSION_SECRET || process.env.SESSION_SECRET;
  return Boolean(s && s.length >= 32 && s !== "netrich-office365-dev-session-secret-change-me");
}

export function requireHardenedSessionSecret(): void {
  if (process.env.NODE_ENV === "production" && !hasHardenedSessionSecret()) {
    throw new Error(
      "PORTAL_SESSION_SECRET must be set to a strong random value (≥32 chars) in production. Cookie forgery is otherwise trivial."
    );
  }
}

export function bootstrapAdminEmail(): string {
  return (process.env.PORTAL_BOOTSTRAP_ADMIN_EMAIL || "admin@netrichtechnologies.com").trim().toLowerCase();
}
