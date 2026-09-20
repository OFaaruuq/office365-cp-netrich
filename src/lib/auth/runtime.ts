/** Shared production-runtime checks for the Next.js BFF. */

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

/** JSON `.data` fallback is forbidden when the live CSP API is required. */
export function localSorForbidden(): boolean {
  return isProductionRuntime();
}

export function backendRequiredResponse() {
  return {
    error:
      "The PostgreSQL CSP API is required in production. Local JSON fallback is disabled.",
    code: "BACKEND_REQUIRED" as const,
  };
}
