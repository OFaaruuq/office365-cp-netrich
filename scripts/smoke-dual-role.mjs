/**
 * Dual-role menu/API smoke test for Super Admin + Client Admin.
 * Run: node scripts/smoke-dual-role.mjs
 */
import * as OTPAuth from "otpauth";

const BASE = process.env.SMOKE_BASE || "http://localhost:3000";
const DEMO_PASSWORD = process.env.DEMO_LOGIN_PASSWORD || "demo";

const PARTNER = {
  email: "admin@netrichtechnologies.com",
  label: "Super Admin",
};

const CLIENT = {
  email: "admin@amtelkom.onmicrosoft.com",
  label: "Client Admin",
};

const PARTNER_PAGES = [
  "/admin",
  "/admin/tenants",
  "/admin/onboarding",
  "/admin/gdap",
  "/admin/catalog",
  "/admin/commerce/pricing",
  "/admin/commerce/quotes",
  "/admin/commerce/orders",
  "/admin/commerce/subscriptions",
  "/admin/commerce/renewals",
  "/admin/billing/invoices",
  "/admin/microsoft/integration",
  "/admin/microsoft/graph-sync",
  "/admin/security/audit",
  "/admin/security/approvals",
  "/admin/security/roles",
  "/admin/security/break-glass",
  "/support",
  "/admin/users",
  "/admin/platform/jobs",
  "/admin/platform/flags",
  "/dashboard",
  "/users",
  "/products",
  "/workspace/groups",
  "/workspace/domains",
  "/workspace/service-health",
  "/catalog/microsoft-365",
  "/catalog/dynamics-365",
  "/catalog/server-software",
  "/catalog/azure",
  "/workspace/renewals",
  "/workspace/billing",
  "/solutions/security",
  "/workspace/organization",
  "/workspace/administrators",
  "/workspace/notifications",
  "/workspace/sessions",
  "/workspace/audit",
  "/solutions/collaboration",
  "/solutions/email-data",
];

const CLIENT_PAGES = [
  "/dashboard",
  "/users",
  "/products",
  "/workspace/groups",
  "/workspace/domains",
  "/workspace/service-health",
  "/catalog/microsoft-365",
  "/catalog/dynamics-365",
  "/catalog/server-software",
  "/catalog/azure",
  "/workspace/renewals",
  "/workspace/billing",
  "/solutions/security",
  "/support",
  "/workspace/organization",
  "/workspace/administrators",
  "/workspace/notifications",
  "/workspace/sessions",
  "/workspace/audit",
  "/solutions/collaboration",
  "/solutions/email-data",
];

const CLIENT_FORBIDDEN = ["/admin", "/admin/tenants", "/admin/catalog", "/admin/users"];

function jar() {
  const cookies = new Map();
  return {
    store(res) {
      const raw = res.headers.getSetCookie?.() || [];
      for (const c of raw) {
        const [pair] = c.split(";");
        const i = pair.indexOf("=");
        if (i > 0) cookies.set(pair.slice(0, i), pair.slice(i + 1));
      }
      // fallback
      const single = res.headers.get("set-cookie");
      if (single && raw.length === 0) {
        const [pair] = single.split(";");
        const i = pair.indexOf("=");
        if (i > 0) cookies.set(pair.slice(0, i), pair.slice(i + 1));
      }
    },
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
  };
}

async function fetchJar(j, path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Cookie: j.header(),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    redirect: "manual",
  });
  j.store(res);
  return res;
}

function totpNow(secret) {
  const totp = new OTPAuth.TOTP({
    issuer: "netrichtechnologies",
    label: "smoke",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret.replace(/\s/g, "")),
  });
  return totp.generate();
}

async function login(account) {
  const j = jar();
  const step1 = await fetchJar(j, "/api/auth/session", {
    method: "POST",
    body: JSON.stringify({ email: account.email, password: DEMO_PASSWORD }),
  });
  const d1 = await step1.json();
  if (!step1.ok) throw new Error(`${account.label} login failed: ${JSON.stringify(d1)}`);

  if (d1.user && d1.user.accountId) {
    return { jar: j, user: d1.user };
  }

  const challengeId = d1.challengeId;
  let secret = d1.secret;
  let action = d1.step === "enroll" ? "enroll" : "verify";

  if (action === "verify" && !secret) {
    // try known secret file
    try {
      const fs = await import("fs");
      const path = await import("path");
      const file = path.join(process.cwd(), ".data", "mfa-secrets.json");
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      const rec = Object.values(raw).find((r) => r.email === account.email && r.enabled);
      if (rec?.secret) secret = rec.secret;
    } catch {
      /* ignore */
    }
  }

  if (!secret && action === "verify") {
    throw new Error(`${account.label}: MFA enrolled but secret unavailable for smoke test`);
  }

  if (action === "enroll" && !secret) {
    throw new Error(`${account.label}: enroll challenge missing secret`);
  }

  const code = totpNow(secret);
  const step2 = await fetchJar(j, "/api/auth/mfa", {
    method: "POST",
    body: JSON.stringify({ challengeId, code, action }),
  });
  const d2 = await step2.json();
  if (!step2.ok) throw new Error(`${account.label} MFA failed: ${JSON.stringify(d2)}`);
  return { jar: j, user: d2.user };
}

async function checkPages(label, j, pages) {
  const fails = [];
  for (const p of pages) {
    const res = await fetchJar(j, p);
    const status = res.status;
    // redirects are ok for auth gates; 200/307/308/302 acceptable if not 401/403/500
    if (status >= 500 || status === 401) {
      fails.push({ path: p, status });
      continue;
    }
    if (status === 200) {
      const text = await res.text();
      if (/Coming Soon|Application error|Internal Server Error/i.test(text)) {
        fails.push({ path: p, status, note: "page content error/coming soon" });
      }
    }
  }
  return fails;
}

async function checkApis(label, j, specs) {
  const fails = [];
  for (const s of specs) {
    const res = await fetchJar(j, s.path, s.init || {});
    const status = res.status;
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const ok = s.expect ? s.expect(status, body) : status >= 200 && status < 400;
    if (!ok) fails.push({ path: s.path, status, body: body?.error || body?.code || null });
  }
  return fails;
}

async function main() {
  const report = { ok: true, roles: {} };

  // Partner
  {
    const { jar: j, user } = await login(PARTNER);
    const pageFails = await checkPages(PARTNER.label, j, PARTNER_PAGES);
    const apiFails = await checkApis(PARTNER.label, j, [
      { path: "/api/csp/reporting", expect: (s, b) => s === 200 && typeof b.customers === "number" },
      { path: "/api/csp/customers", expect: (s, b) => s === 200 && Array.isArray(b.customers) },
      { path: "/api/csp/orders", expect: (s, b) => s === 200 && Array.isArray(b.orders) },
      { path: "/api/csp/subscriptions", expect: (s, b) => s === 200 && Array.isArray(b.subscriptions) },
      { path: "/api/csp/approvals", expect: (s, b) => s === 200 && Array.isArray(b.approvals) },
      { path: "/api/csp/jobs", expect: (s, b) => s === 200 && Array.isArray(b.jobs) },
      { path: "/api/csp/gdap", expect: (s, b) => s === 200 },
      { path: "/api/admin/customers", expect: (s, b) => s === 200 && Array.isArray(b.customers) },
      {
        path: "/api/me/workspace?customerId=cust-amtel",
        expect: (s, b) => s === 200 && b.workspace?.customerId === "cust-amtel",
      },
      {
        path: "/api/csp/domains?customerId=cust-amtel",
        expect: (s, b) => s === 200 && Array.isArray(b.domains) && b.domains.length > 0,
      },
      {
        path: "/api/csp/security?customerId=cust-amtel",
        expect: (s, b) => s === 200 && b.security,
      },
      { path: "/api/csp/notifications", expect: (s, b) => s === 200 && Array.isArray(b.notifications) },
    ]);
    report.roles.partner = {
      user: { email: user.email, role: user.role },
      pageFails,
      apiFails,
      pass: pageFails.length === 0 && apiFails.length === 0,
    };
    if (!report.roles.partner.pass) report.ok = false;
  }

  // Client
  {
    const { jar: j, user } = await login(CLIENT);
    const pageFails = await checkPages(CLIENT.label, j, CLIENT_PAGES);
    const forbiddenFails = [];
    for (const p of CLIENT_FORBIDDEN) {
      const res = await fetchJar(j, p);
      // middleware should redirect away from /admin
      if (res.status === 200) {
        const text = await res.text();
        if (/Partner Control Center|SUPER ADMIN/i.test(text)) {
          forbiddenFails.push({ path: p, status: 200, note: "client saw partner UI" });
        }
      }
    }
    const apiFails = await checkApis(CLIENT.label, j, [
      {
        path: "/api/me/workspace",
        expect: (s, b) => s === 200 && b.workspace?.customerId === user.customerId,
      },
      { path: "/api/users", expect: (s, b) => s === 200 && Array.isArray(b.users) },
      {
        path: "/api/csp/domains?customerId=" + encodeURIComponent(user.customerId),
        expect: (s, b) => s === 200 && Array.isArray(b.domains),
      },
      {
        path: "/api/csp/billing/overview?customerId=" + encodeURIComponent(user.customerId),
        expect: (s, b) => s === 200 && b.cost,
      },
      {
        path: "/api/csp/security?customerId=" + encodeURIComponent(user.customerId),
        expect: (s, b) => s === 200 && b.security,
      },
      { path: "/api/admin/customers", expect: (s) => s === 401 || s === 403 },
      {
        path: "/api/me/workspace?customerId=cust-mtpi0408",
        expect: (s, b) =>
          s === 403 ||
          s === 400 ||
          (s === 200 && b.workspace?.customerId === user.customerId) ||
          b?.code === "TENANT_ISOLATION",
      },
    ]);
    report.roles.client = {
      user: { email: user.email, role: user.role, customerId: user.customerId },
      pageFails,
      forbiddenFails,
      apiFails,
      pass: pageFails.length === 0 && forbiddenFails.length === 0 && apiFails.length === 0,
    };
    if (!report.roles.client.pass) report.ok = false;
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
