/** NestJS CSP API base (Phase 1 Foundation) */
export function cspApiBase(): string {
  return (
    process.env.NEXT_PUBLIC_CSP_API_URL ||
    process.env.CSP_API_URL ||
    "http://localhost:8080"
  );
}

export async function cspFetch(path: string, init: RequestInit = {}) {
  const url = path.startsWith("http") ? path : `${cspApiBase()}${path.startsWith("/") ? "" : "/"}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
}
