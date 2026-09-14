/**
 * Production auth smoke (no demo credentials).
 * Run: node scripts/smoke-dual-role.mjs
 */
const BASE = process.env.SMOKE_BASE || "http://localhost:3000";

async function json(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function main() {
  const fails = [];

  const home = await fetch(BASE);
  if (!home.ok) fails.push(`GET / → ${home.status}`);

  const session = await json("/api/auth/session");
  if (session.status !== 200 || session.body?.authenticated !== false) {
    fails.push(`GET /api/auth/session expected unauthenticated 200, got ${session.status}`);
  }
  if (session.body?.demoLogin === true) {
    fails.push("GET /api/auth/session still advertises demoLogin");
  }

  const personas = await json("/api/auth/personas");
  if (personas.body?.accounts?.length) {
    fails.push("GET /api/auth/personas must not list accounts");
  }

  const entra = await json("/api/auth/entra", { method: "POST", body: "{}" });
  if (entra.status !== 400 && entra.status !== 401) {
    fails.push(`POST /api/auth/entra without token expected 400/401, got ${entra.status}`);
  }

  const creds = await json("/api/auth/session", {
    method: "POST",
    body: JSON.stringify({ email: "admin@amtelkom.onmicrosoft.com", password: "demo" }),
  });
  if (creds.status !== 403 && creds.status !== 401) {
    fails.push(`POST /api/auth/session with fixture demo creds expected 403/401, got ${creds.status}`);
  }
  if (creds.body?.code === "DEMO_LOGIN_DISABLED") {
    fails.push("Legacy DEMO_LOGIN_DISABLED still in use");
  }

  if (fails.length) {
    console.error("Auth smoke failed:");
    for (const f of fails) console.error(" -", f);
    process.exit(1);
  }
  console.log("Auth smoke OK — Entra is the sign-in path; demo credentials are rejected.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
