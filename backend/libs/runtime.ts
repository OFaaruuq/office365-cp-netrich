export const DEV_SESSION_SECRET = "netrich-office365-dev-session-secret-change-me";
export const DEV_INTERNAL_SECRET = "netrich-csp-dev-internal-secret";

export function isProductionRuntime(): boolean {
  const env = process.env.NODE_ENV;
  if (env === "development" || env === "test") return false;
  if (env === "production") return true;
  return (
    process.env.CSP_ENFORCE_PRODUCTION_SECRETS === "true" ||
    process.env.HOSTNAME === "0.0.0.0"
  );
}

export function assertHardenedSecrets() {
  if (!isProductionRuntime()) return;
  const internal = process.env.CSP_INTERNAL_API_SECRET || "";
  if (internal.length < 16 || internal === DEV_INTERNAL_SECRET) {
    throw new Error(
      "CSP_INTERNAL_API_SECRET must be a unique value (≥16 chars) in production. The published default is rejected."
    );
  }
  const session = process.env.PORTAL_SESSION_SECRET || process.env.SESSION_SECRET || "";
  if (session.length < 32 || session === DEV_SESSION_SECRET) {
    throw new Error(
      "PORTAL_SESSION_SECRET must be a unique value (≥32 chars) in production. The published default is rejected."
    );
  }
}
