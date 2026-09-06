/**
 * Demo passwordless login is for local/dev only unless explicitly enabled.
 * Production must set PORTAL_SESSION_SECRET and use Entra (or ALLOW_DEMO_LOGIN=true for staging demos).
 */
export function isDemoLoginAllowed(): boolean {
  if (process.env.ALLOW_DEMO_LOGIN === "true") return true;
  return process.env.NODE_ENV !== "production";
}

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
