import type { ServerSession } from "@/lib/auth/server-session";

/** NestJS CSP API base (Phase 1 Foundation) */
export function cspApiBase(): string {
  return process.env.CSP_API_URL || "http://localhost:8080";
}

export function cspInternalSecret(): string {
  const configured = process.env.CSP_INTERNAL_API_SECRET || "";
  if (configured.length >= 16 && configured !== "netrich-csp-dev-internal-secret") return configured;
  if (process.env.NODE_ENV === "production") return "";
  return "netrich-csp-dev-internal-secret";
}

/** Headers Next attaches after authenticating the portal session. Never taken from the browser. */
export function cspInternalHeaders(
  _session?: Pick<ServerSession, "role" | "accountId" | "customerId">,
  _customerId?: string,
  sessionToken?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-csp-internal-secret": cspInternalSecret(),
  };
  if (sessionToken) {
    headers["x-portal-session"] = sessionToken;
  }
  return headers;
}

export async function cspFetch(path: string, init: RequestInit = {}) {
  const url = path.startsWith("http") ? path : `${cspApiBase()}${path.startsWith("/") ? "" : "/"}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      ...cspInternalHeaders(),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
}
