# Production deployment (native — no containers)

**Product:** netrichtechnologies Microsoft 365 Control Panel  
**Public URL:** `https://office365.cp.netrichtechnologies.com`  
**Runtime model:** Node.js processes + native PostgreSQL + native Redis + a TLS reverse proxy  
**Not used:** Docker, Docker Compose, Kubernetes, or any other container runtime

This is the production runbook. It assumes a dedicated Windows Server or Linux VM (or two VMs) that you administer directly. Every command, port, secret, and process below matches the code in this repository.

Related reading:

| Document | Use when |
|----------|----------|
| [DOCUMENTATION.md](./DOCUMENTATION.md) | Product modules, APIs, UI |
| [CSP_PRODUCTION_ARCHITECTURE.md](./CSP_PRODUCTION_ARCHITECTURE.md) | SAM, GDAP, NCE, maturity stages |
| [BACKEND.md](./BACKEND.md) | NestJS / Prisma design |
| [MULTI_TENANT.md](./MULTI_TENANT.md) | Isolation, terminate lifecycle, view-as |
| [backend/README.md](../backend/README.md) | Nest API surface |

---

## Table of contents

1. [What you are deploying](#1-what-you-are-deploying)
2. [Production topology](#2-production-topology)
3. [Hard production rules](#3-hard-production-rules)
4. [Prerequisites](#4-prerequisites)
5. [DNS, TLS, and firewall](#5-dns-tls-and-firewall)
6. [Install PostgreSQL (native)](#6-install-postgresql-native)
7. [Install Redis (native)](#7-install-redis-native)
8. [Install Node.js and clone the app](#8-install-nodejs-and-clone-the-app)
9. [Environment files](#9-environment-files)
10. [Microsoft Entra ID](#10-microsoft-entra-id)
11. [Database migrate, RLS, and seed](#11-database-migrate-rls-and-seed)
12. [Build](#12-build)
13. [Run as OS services](#13-run-as-os-services)
14. [Reverse proxy](#14-reverse-proxy)
15. [First Super Admin and break-glass](#15-first-super-admin-and-break-glass)
16. [Health checks and go-live](#16-health-checks-and-go-live)
17. [Updates and redeploy](#17-updates-and-redeploy)
18. [Backups](#18-backups)
19. [Logging, monitoring, and operations](#19-logging-monitoring-and-operations)
20. [Security hardening](#20-security-hardening)
21. [Production checklist](#21-production-checklist)
22. [Troubleshooting](#22-troubleshooting)
23. [Environment variable catalog](#23-environment-variable-catalog)

---

## 1. What you are deploying

This is a **multi-tenant CSP control panel**. Partner Super Admins operate customers, GDAP, onboarding, catalog, billing, and audit. Client Admins manage only their own Microsoft tenant workspace. Support agents work isolated Technical / Billing queues.

### Processes

| Process | Package | Bind | Public? |
|---------|---------|------|---------|
| **Next.js UI + BFF** | repo root (`netrich-office365-cp`) | `127.0.0.1:3000` | No — only via TLS proxy |
| **NestJS CSP API** | `backend/` (`netrich-csp-backend`) | `127.0.0.1:8080` | **Never** |
| **BullMQ worker** | `backend/` | no HTTP | No |
| **PostgreSQL 16** | OS package / EDB installer | `127.0.0.1:5432` | **Never** |
| **Redis 7** | OS package / Memurai | `127.0.0.1:6379` | **Never** |
| **TLS reverse proxy** | IIS ARR or Nginx | `:443` | Yes |

The browser talks **only** to Next.js. Next.js authenticates the portal session, then calls Nest on the loopback interface with:

- `x-csp-internal-secret` (shared secret)
- `x-portal-session` (HMAC session token)

Nest does **not** accept Entra bearer tokens from the public internet. Direct Entra JWT on Nest is unused in this topology; Next.js is the only identity plane.

### Request path

```text
Internet (HTTPS 443)
        │
        ▼
IIS / Nginx  (TLS terminate, HSTS, X-Real-IP)
        │
        ▼
Next.js  :3000
  • Pages + MSAL Entra SSO
  • Route handlers /api/auth, /api/admin, /api/support, …
  • BFF /api/csp/*  ──internal secret──►  NestJS :8080 /v1/*
        │                                      │
        ▼                                      ▼
   .data/*.json                         PostgreSQL + RLS
   (accounts, MFA, sessions,            Redis + BullMQ worker
    support chat, local commerce)       Graph / Partner Center
```

### Two data planes (both required in production)

**PostgreSQL** is the CSP system of record for customers, GDAP, onboarding, RBAC, directory, jobs, audit, commerce tables, and notifications. In production, `/api/csp/*` **must** reach Nest. If Nest or Postgres is down, those routes return `503 BACKEND_REQUIRED`. There is **no** JSON fallback for CSP APIs.

**`.data/` on the Next.js host** is still required. Next.js stores portal accounts, session revocation, MFA secrets, password hashes, support threads, catalog, and other UI-local files there. Treat `.data` as production state, not a cache.

### Maturity (what is live vs gated)

| Stage | In this deploy |
|-------|----------------|
| MVP UI | Entra SSO, Partner Control Center, client workspace, local commerce, isolation |
| Phase 1 Foundation | Nest + Postgres + RLS + worker |
| Phase 2 Microsoft Connected | Graph / Partner Center **read** when credentials are set; otherwise honest `*_NOT_CONFIGURED` |
| Phase 3 Full CSP | Partner Center **writes** stay off until `PARTNER_CENTER_WRITES_ENABLED=true` |

---

## 2. Production topology

Recommended: **one VM** (all loopback) for a first production host. Split later if load requires it.

```text
office365.cp.netrichtechnologies.com
        │
   [ Windows Server / Ubuntu LTS ]
        ├── IIS or Nginx :443
        ├── next  (node)     127.0.0.1:3000
        ├── nest  (node)     127.0.0.1:8080
        ├── worker (node)
        ├── PostgreSQL       127.0.0.1:5432
        └── Redis / Memurai  127.0.0.1:6379
```

If you split hosts later:

| Host | Runs |
|------|------|
| **web** | Nginx/IIS + Next.js. `CSP_API_URL=http://<api-host>:8080` over a private network, never the internet |
| **api** | Nest + worker. Postgres and Redis may sit here or on a dedicated DB host |
| **db** | PostgreSQL only, private subnet |

Nest must remain unreachable from the public internet in every layout.

---

## 3. Hard production rules

The app **refuses to boot or deploy** if these are violated. `npm run deploy:check` encodes the same rules.

| Rule | Why |
|------|-----|
| `NODE_ENV=production` | Enables `__Host-` session cookie, Secure cookies, secret checks |
| `PORTAL_SESSION_SECRET` ≥ 32 chars, not the published default | Session HMAC; cookie forgery is otherwise trivial |
| `CSP_INTERNAL_API_SECRET` ≥ 16 chars, not the published default | Next → Nest mutual auth |
| `CSP_API_URL` set (example: `http://127.0.0.1:8080`) | Production disables JSON CSP fallback |
| **Do not set** `NEXT_PUBLIC_CSP_API_URL` | Would bake Nest’s URL into the browser bundle |
| **Do not set** `GRAPH_ACCESS_TOKEN` | Production Graph must use per-tenant app credentials |
| **Do not set** `ALLOW_DEMO_LOGIN=true` | Entra SSO is the only everyday sign-in path |
| `PORTAL_BOOTSTRAP_ADMIN_EMAIL` must **not** be `admin@netrichtechnologies.com` | Published mailbox is rejected |
| HTTPS on the public URL | `__Host-nt_portal_session` requires Secure + `Path=/` and no `Domain=` |
| Bind Next/Nest/Postgres/Redis to **localhost** (or a private NIC) | Only the reverse proxy is public |

Published defaults the app rejects:

```text
PORTAL_SESSION_SECRET=netrich-office365-dev-session-secret-change-me
CSP_INTERNAL_API_SECRET=netrich-csp-dev-internal-secret
```

---

## 4. Prerequisites

| Component | Version | Notes |
|-----------|---------|--------|
| OS | Windows Server 2022/2025 **or** Ubuntu 22.04/24.04 LTS | This guide covers both |
| CPU / RAM | 4 vCPU, 8 GB RAM minimum | 8 vCPU / 16 GB if Graph sync is heavy |
| Disk | 80 GB+ SSD | Postgres data + `.data` + logs |
| Node.js | **20.x LTS** (64-bit) | 22 LTS is acceptable; do not use odd Node versions |
| npm | Ships with Node | Used for `npm ci` |
| Git | Current | Clone / pull |
| PostgreSQL | **16** | Native installer or OS package |
| Redis | **7** | Linux: `redis-server`. Windows: **Memurai** (Redis protocol) or Azure Cache for Redis |
| Reverse proxy | IIS + URL Rewrite + ARR **or** Nginx | TLS 1.2+ |
| TLS certificate | Public CA | Let’s Encrypt, commercial, or your PKI |
| Outbound HTTPS | To Microsoft | `login.microsoftonline.com`, `graph.microsoft.com`, `api.partnercenter.microsoft.com` |

**Do not install Docker Desktop, Docker Engine, containerd, or Podman on this host for this product.**

---

## 5. DNS, TLS, and firewall

### DNS

| Record | Value |
|--------|-------|
| `A` or `CNAME` | `office365.cp.netrichtechnologies.com` → this host’s public IP / load balancer |

Optional later: `api.office365.cp.netrichtechnologies.com` is **not** required. Nest stays private.

### Public ports

| Port | Action |
|------|--------|
| **443/tcp** | Allow from internet (HTTPS) |
| **80/tcp** | Allow only to redirect to 443 |
| **22/tcp or 3389** | Admin only, preferably VPN / jump host |
| **3000, 8080, 5432, 6379** | **Block** from the internet. Bind services to `127.0.0.1` |

Windows (run elevated PowerShell):

```powershell
New-NetFirewallRule -DisplayName "M365 CP HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
New-NetFirewallRule -DisplayName "M365 CP HTTP redirect" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
```

Linux:

```bash
sudo ufw allow 443/tcp
sudo ufw allow 80/tcp
sudo ufw enable
```

### TLS

Terminate TLS at IIS or Nginx. Next.js also sends `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` — the proxy should do the same.

The production session cookie name is `__Host-nt_portal_session`. That cookie is dropped by browsers unless the site is served over HTTPS with `Path=/` and **no** `Domain` attribute. Do not rewrite cookie Domain in the proxy.

---

## 6. Install PostgreSQL (native)

Use a **non-superuser** role for the application. Superuser connections bypass Row Level Security even when `FORCE ROW LEVEL SECURITY` is on. Migrations can use a slightly more privileged owner; the Nest runtime should not be `postgres` / `sa`.

### Windows (EDB installer)

1. Download PostgreSQL 16 from [https://www.enterprisedb.com/downloads/postgres-postgresql-downloads](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads).
2. Install. Set a strong password for the `postgres` superuser. Keep the port `5432`.
3. Add `C:\Program Files\PostgreSQL\16\bin` to the system `PATH`.
4. Restrict `pg_hba.conf` to localhost (the installer default is usually local + scram).

Create the database (PowerShell):

```powershell
$env:PGPASSWORD = "<postgres-superuser-password>"
psql -U postgres -h 127.0.0.1 -c "CREATE ROLE netrich LOGIN PASSWORD '<strong-db-password>';"
psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE netrich_csp OWNER netrich;"
psql -U postgres -h 127.0.0.1 -d netrich_csp -c "GRANT ALL ON SCHEMA public TO netrich;"
psql -U postgres -h 127.0.0.1 -d netrich_csp -c "ALTER DATABASE netrich_csp SET timezone TO 'UTC';"
Remove-Item Env:PGPASSWORD
```

Confirm `postgresql.conf` has:

```text
listen_addresses = 'localhost'
port = 5432
```

### Linux (Ubuntu)

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql <<'SQL'
CREATE ROLE netrich LOGIN PASSWORD '<strong-db-password>';
CREATE DATABASE netrich_csp OWNER netrich;
\c netrich_csp
GRANT ALL ON SCHEMA public TO netrich;
ALTER DATABASE netrich_csp SET timezone TO 'UTC';
SQL
```

Confirm listen:

```bash
sudo ss -lntp | grep 5432
# should show 127.0.0.1:5432, not 0.0.0.0:5432
```

If it listens on all interfaces, set `listen_addresses = 'localhost'` in `/etc/postgresql/16/main/postgresql.conf` and reload.

### Connection string

```text
DATABASE_URL=postgresql://netrich:<url-encoded-password>@127.0.0.1:5432/netrich_csp?schema=public
```

URL-encode special characters in the password (`@` → `%40`, `#` → `%23`, etc.).

---

## 7. Install Redis (native)

Redis is the BullMQ broker. If Redis is down, Nest **enqueues jobs inline** in the API process. Production should still run Redis + the worker so Graph/Partner Center sync does not block HTTP.

### Windows — Memurai

Redis Inc. does not ship a supported Windows engine. Use [Memurai](https://www.memurai.com/) (Redis protocol compatible) or **Azure Cache for Redis** (managed, still not a container on this host).

1. Install Memurai Developer or Memurai Enterprise.
2. Bind to `127.0.0.1:6379`.
3. Set a requirepass if the service might ever leave localhost:

```text
bind 127.0.0.1
port 6379
requirepass <strong-redis-password>
```

```text
REDIS_URL=redis://:url-encoded-password@127.0.0.1:6379
```

If Redis has no password and is localhost-only:

```text
REDIS_URL=redis://127.0.0.1:6379
```

### Linux

```bash
sudo apt install -y redis-server
sudo sed -i 's/^bind .*/bind 127.0.0.1/' /etc/redis/redis.conf
# optional: requirepass <strong-redis-password>
sudo systemctl enable --now redis-server
redis-cli ping   # PONG
```

---

## 8. Install Node.js and clone the app

### Node.js 20 LTS

- Windows: [https://nodejs.org](https://nodejs.org) — 20.x LTS MSI, “Add to PATH”.
- Linux:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
node -v   # v20.x
```

### Layout on disk

Pick a dedicated directory owned by a non-admin service account.

| OS | Suggested path |
|----|----------------|
| Windows | `C:\netrich\office365` |
| Linux | `/opt/netrich/office365` |

```powershell
# Windows — as the service account
mkdir C:\netrich
cd C:\netrich
git clone <your-repo-url> office365
cd office365
```

```bash
# Linux
sudo mkdir -p /opt/netrich
sudo useradd --system --home /opt/netrich --shell /usr/sbin/nologin netrich
sudo git clone <your-repo-url> /opt/netrich/office365
sudo chown -R netrich:netrich /opt/netrich/office365
```

Create persistent data dirs:

```powershell
New-Item -ItemType Directory -Force -Path C:\netrich\office365\.data | Out-Null
New-Item -ItemType Directory -Force -Path C:\netrich\office365\logs | Out-Null
```

```bash
sudo -u netrich mkdir -p /opt/netrich/office365/.data /opt/netrich/office365/logs
```

ACL: only the service account and admins should read `.data` and `.env.production` (passwords, TOTP secrets, session registry).

---

## 9. Environment files

Production uses **two** env files. Neither is committed.

| File | Process |
|------|---------|
| `.env.production` (repo root) | Next.js (`next build` / `next start`) and `npm run deploy:*` |
| `backend/.env` | Nest API + worker + Prisma |

Copy templates:

```powershell
copy .env.production.example .env.production
copy backend\.env.production.example backend\.env
```

```bash
cp .env.production.example .env.production
cp backend/.env.production.example backend/.env
```

Generate secrets (run twice; use different values):

```powershell
npm run deploy:secret
```

Paste:

- one value → `PORTAL_SESSION_SECRET` in **both** files (must match — Nest verifies the same HMAC)
- one value → `CSP_INTERNAL_API_SECRET` in **both** files (must match)

### Root `.env.production` (minimum)

```env
NODE_ENV=production
PORT=3000
HOSTNAME=127.0.0.1

NEXT_PUBLIC_APP_URL=https://office365.cp.netrichtechnologies.com
NEXT_PUBLIC_APP_DOMAIN=office365.cp.netrichtechnologies.com

NEXT_PUBLIC_AZURE_AD_CLIENT_ID=<entra-spa-application-id>
NEXT_PUBLIC_AZURE_AD_AUTHORITY=https://login.microsoftonline.com/<partner-tenant-id>
AZURE_AD_TENANT_ID=<partner-tenant-id>
AZURE_AD_API_AUDIENCE=<same-as-spa-client-id-or-api-app-id>

CSP_API_URL=http://127.0.0.1:8080
CSP_INTERNAL_API_SECRET=<generated-16+-chars>

PORTAL_SESSION_SECRET=<generated-32+-chars>
PORTAL_BOOTSTRAP_ADMIN_EMAIL=<your-real-partner-admin-upn>

TRUST_PROXY=true
```

Do **not** set `NEXT_PUBLIC_CSP_API_URL`, `GRAPH_ACCESS_TOKEN`, or `ALLOW_DEMO_LOGIN`.

`HOSTNAME=127.0.0.1` keeps Next off the public NIC. The reverse proxy connects to localhost. If you must bind all interfaces, use `0.0.0.0` **and** a host firewall that blocks 3000 from the internet.

### `backend/.env` (minimum)

```env
NODE_ENV=production
PORT=8080

DATABASE_URL=postgresql://netrich:<password>@127.0.0.1:5432/netrich_csp?schema=public
REDIS_URL=redis://127.0.0.1:6379

PORTAL_SESSION_SECRET=<same-as-root>
CSP_INTERNAL_API_SECRET=<same-as-root>

CORS_ORIGINS=https://office365.cp.netrichtechnologies.com

AZURE_AD_TENANT_ID=<partner-tenant-id>
AZURE_AD_API_AUDIENCE=<same-as-root>
AZURE_AD_SPA_CLIENT_ID=<entra-spa-application-id>

PARTNER_CENTER_MODE=sandbox
PARTNER_CENTER_WRITES_ENABLED=false
```

Validate the UI env:

```powershell
npm run deploy:check
```

---

## 10. Microsoft Entra ID

Everyday sign-in is **Microsoft Entra ID** (MSAL in the browser). Nest does not host a login page.

### App registration (partner / CSP tenant)

1. Entra admin center → **App registrations** → New registration.
2. Name: `netrichtechnologies Microsoft 365 Control Panel`.
3. Supported account types: **Accounts in this organizational directory only** (recommended) **or** Multitenant if customer admins from other directories will sign in with the same SPA. The UI default authority is `https://login.microsoftonline.com/common`; pin it to your tenant ID for partner-only:
   `https://login.microsoftonline.com/<tenant-id>`
4. Platform: **Single-page application (SPA)**
   - Redirect URI: `https://office365.cp.netrichtechnologies.com`
   - Front-channel logout: `https://office365.cp.netrichtechnologies.com`
5. **Implicit grant:** leave access/ID tokens for SPA **off** unless you have a documented need. MSAL uses auth-code + PKCE.
6. Certificates & secrets: not required for the SPA. Use a **client secret or certificate** only on the Nest Graph / Partner Center app (separate registration recommended).
7. Token configuration: optional claim `email` / `preferred_username` on the ID token if not already present.
8. API permissions (delegated, for the signed-in user):
   - `openid`, `profile`, `email`, `User.Read` (login)
   - Add Graph delegated scopes later as features go live (`User.Read.All`, `Directory.Read.All`, `Organization.Read.All`, `LicenseAssignment.ReadWrite.All`) and **grant admin consent**.
9. Expose an API / Application ID URI if you use a separate API audience. Set `AZURE_AD_API_AUDIENCE` to that URI **or** to the SPA client ID — Next verifies ID/access tokens against those audiences (`src/lib/auth/entra-token.ts`).

Copy **Application (client) ID** into `NEXT_PUBLIC_AZURE_AD_CLIENT_ID` and `AZURE_AD_SPA_CLIENT_ID`.  
Copy **Directory (tenant) ID** into `AZURE_AD_TENANT_ID`.

### Graph / Partner Center (optional Phase 2)

Use a **separate** confidential client (certificate preferred). Put:

```env
GRAPH_CLIENT_ID=
GRAPH_CLIENT_SECRET=
GRAPH_TENANT_ID=

PARTNER_CENTER_APP_ID=
PARTNER_CENTER_APP_SECRET=
PARTNER_CENTER_TENANT_ID=
PARTNER_CENTER_ACCOUNT_ID=
PARTNER_CENTER_MODE=sandbox
PARTNER_CENTER_WRITES_ENABLED=false
```

in `backend/.env` (and Graph IDs in root `.env.production` only if Next Graph helpers need them). Prefer Azure Key Vault later (`AZURE_KEY_VAULT_URI`).

Until credentials exist, Microsoft calls fail with `GRAPH_NOT_CONFIGURED` / `PC_NOT_CONFIGURED`. That is expected and honest — the UI must not invent Secure Score or Partner Center data.

---

## 11. Database migrate, RLS, and seed

From `backend/` with `backend/.env` loaded (Prisma reads `DATABASE_URL` from `backend/.env`).

### Windows

```powershell
cd C:\netrich\office365\backend
npm ci
npx prisma generate
npx prisma migrate deploy
npx prisma db execute --file prisma\rls.sql --schema prisma\schema.prisma
# Policies: migrate 20260909000000 / 20260919000000 already include FORCE RLS + WITH CHECK.
# Re-apply the canonical file if you ever recreate the database:
#   psql -U netrich -h 127.0.0.1 -d netrich_csp -f prisma\rls-policies.sql
npm run prisma:seed
```

Optional import of an existing MVP `.data` tree from a lab machine:

```powershell
npm run migrate:from-data
```

### Linux

```bash
cd /opt/netrich/office365/backend
sudo -u netrich -H bash -lc 'npm ci && npx prisma generate && npx prisma migrate deploy'
sudo -u postgres psql -d netrich_csp -f /opt/netrich/office365/backend/prisma/rls.sql
sudo -u netrich -H bash -lc 'npm run prisma:seed'
```

What seed creates:

- Partner `netrichtechnologies`
- Permission catalog + role packs
- Feature flags
- Integration health stubs
- A Postgres `portal_users` row for `admin@netrichtechnologies.com` (RBAC seed only)

That seed mailbox is **not** a Next.js login. Next.js bootstrap uses `PORTAL_BOOTSTRAP_ADMIN_EMAIL` (must be a real UPN that is **not** the published default). After first Entra sign-in, Super Admin provisions everyone else in **Users**.

Confirm RLS helpers exist:

```sql
SELECT proname FROM pg_proc WHERE proname LIKE 'app_%';
-- app_current_customer_id, app_current_user_id, app_current_role,
-- app_is_partner_admin, app_customer_matches
```

Confirm a tenant table is forced:

```sql
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class WHERE relname = 'customers';
-- relrowsecurity = t, relforcerowsecurity = t
```

---

## 12. Build

Install and compile **both** packages.

### UI (repo root)

`next.config.ts` sets `output: "standalone"`. Production still runs via `next start` (used by `npm run deploy:build`).

```powershell
cd C:\netrich\office365
npm ci
npm run deploy:check
npm run deploy:build
```

`deploy:build` runs `npm ci` then `next build` with `NODE_ENV=production`. It will fail if `.env.production` violates the rules in §3.

### API + worker

```powershell
cd C:\netrich\office365\backend
npm ci
npx prisma generate
npm run build
```

`npm run build` in backend is `tsc`. Runtime scripts `start:api` / `start:worker` use `tsx` on TypeScript sources, which is supported for production as long as `NODE_ENV=production` is set. Either:

- `npx tsx apps/api/src/main.ts`, or
- `node dist/apps/api/src/main.js` after `npm run build` (if you point `NODE_PATH` / copy assets as needed)

This runbook uses **tsx** (matches `backend/package.json` `start:api`).

---

## 13. Run as OS services

Do **not** leave `npm start` attached to an RDP/SSH session. Register three processes that restart on failure and on boot.

Working directories:

| Service | Working directory | Command | Env |
|---------|-------------------|---------|-----|
| `nt-office365-web` | repo root | `npx next start -p 3000 -H 127.0.0.1` | `.env.production` |
| `nt-office365-api` | `backend/` | `npx tsx apps/api/src/main.ts` | `backend/.env` |
| `nt-office365-worker` | `backend/` | `npx tsx apps/worker/src/main.ts` | `backend/.env` |

Start **PostgreSQL and Redis first**, then API, then worker, then Next.

### Windows — NSSM

Install [NSSM](https://nssm.cc/download) (64-bit) to e.g. `C:\netrich\nssm.exe`.

Find Node:

```powershell
(Get-Command node).Source
# e.g. C:\Program Files\nodejs\node.exe
(Get-Command npx).Source
```

On Windows, `npx` is `npx.cmd`. NSSM should launch `cmd.exe /c` so `.cmd` shims work.

```powershell
$nssm = "C:\netrich\nssm.exe"
$root = "C:\netrich\office365"
$nodeDir = "C:\Program Files\nodejs"
$envWeb = Get-Content "$root\.env.production" -Raw
# NSSM AppEnvironmentExtra is set below one variable at a time for reliability.

# --- web ---
& $nssm install nt-office365-web "$nodeDir\npx.cmd" "next start -p 3000 -H 127.0.0.1"
& $nssm set nt-office365-web AppDirectory $root
& $nssm set nt-office365-web AppStdout "$root\logs\web.out.log"
& $nssm set nt-office365-web AppStderr "$root\logs\web.err.log"
& $nssm set nt-office365-web AppRotateFiles 1
& $nssm set nt-office365-web AppRotateBytes 10485760
& $nssm set nt-office365-web Start SERVICE_AUTO_START
& $nssm set nt-office365-web AppExit Default Restart
& $nssm set nt-office365-web AppEnvironmentExtra NODE_ENV=production

# Load every KEY=VALUE from .env.production into the service (skip comments)
Get-Content "$root\.env.production" | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $i = $line.IndexOf("=")
  if ($i -lt 1) { return }
  $k = $line.Substring(0, $i).Trim()
  $v = $line.Substring($i + 1).Trim().Trim('"')
  & $nssm set nt-office365-web AppEnvironmentExtra $k=$v
}

# --- api ---
& $nssm install nt-office365-api "$nodeDir\npx.cmd" "tsx apps/api/src/main.ts"
& $nssm set nt-office365-api AppDirectory "$root\backend"
& $nssm set nt-office365-api AppStdout "$root\logs\api.out.log"
& $nssm set nt-office365-api AppStderr "$root\logs\api.err.log"
& $nssm set nt-office365-api AppRotateFiles 1
& $nssm set nt-office365-api Start SERVICE_AUTO_START
Get-Content "$root\backend\.env" | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $i = $line.IndexOf("=")
  if ($i -lt 1) { return }
  $k = $line.Substring(0, $i).Trim()
  $v = $line.Substring($i + 1).Trim().Trim('"')
  & $nssm set nt-office365-api AppEnvironmentExtra $k=$v
}

# --- worker ---
& $nssm install nt-office365-worker "$nodeDir\npx.cmd" "tsx apps/worker/src/main.ts"
& $nssm set nt-office365-worker AppDirectory "$root\backend"
& $nssm set nt-office365-worker AppStdout "$root\logs\worker.out.log"
& $nssm set nt-office365-worker AppStderr "$root\logs\worker.err.log"
& $nssm set nt-office365-worker AppRotateFiles 1
& $nssm set nt-office365-worker Start SERVICE_AUTO_START
Get-Content "$root\backend\.env" | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $i = $line.IndexOf("=")
  if ($i -lt 1) { return }
  $k = $line.Substring(0, $i).Trim()
  $v = $line.Substring($i + 1).Trim().Trim('"')
  & $nssm set nt-office365-worker AppEnvironmentExtra $k=$v
}

# PostgreSQL / Memurai services should already be Automatic.
Start-Service nt-office365-api
Start-Sleep -Seconds 3
Start-Service nt-office365-worker
Start-Service nt-office365-web
Get-Service nt-office365-*
```

NSSM `AppEnvironmentExtra` **replaces** the extra env block each time you `set` it. If the last loop does not accumulate, set variables in a wrapper `.cmd` instead:

`C:\netrich\office365\scripts\windows\start-web.cmd`:

```bat
@echo off
cd /d C:\netrich\office365
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /v /b /c:"#" .env.production`) do (
  if not "%%A"=="" set "%%A=%%B"
)
set NODE_ENV=production
"C:\Program Files\nodejs\npx.cmd" next start -p 3000 -H 127.0.0.1
```

`C:\netrich\office365\scripts\windows\start-api.cmd`:

```bat
@echo off
cd /d C:\netrich\office365\backend
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /v /b /c:"#" .env`) do (
  if not "%%A"=="" set "%%A=%%B"
)
set NODE_ENV=production
"C:\Program Files\nodejs\npx.cmd" tsx apps/api/src/main.ts
```

`C:\netrich\office365\scripts\windows\start-worker.cmd`:

```bat
@echo off
cd /d C:\netrich\office365\backend
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /v /b /c:"#" .env`) do (
  if not "%%A"=="" set "%%A=%%B"
)
set NODE_ENV=production
"C:\Program Files\nodejs\npx.cmd" tsx apps/worker/src/main.ts
```

Then NSSM Application path = those `.cmd` files (or `cmd.exe` /c path).

```powershell
& $nssm install nt-office365-web "C:\netrich\office365\scripts\windows\start-web.cmd"
& $nssm set nt-office365-web AppDirectory "C:\netrich\office365"
```

### Linux — systemd

`/etc/systemd/system/nt-office365-api.service`:

```ini
[Unit]
Description=netrichtechnologies CSP API
After=network.target postgresql.service redis-server.service
Requires=postgresql.service redis-server.service

[Service]
Type=simple
User=netrich
WorkingDirectory=/opt/netrich/office365/backend
EnvironmentFile=/opt/netrich/office365/backend/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/npx tsx apps/api/src/main.ts
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/nt-office365-worker.service`:

```ini
[Unit]
Description=netrichtechnologies CSP worker
After=nt-office365-api.service redis-server.service

[Service]
Type=simple
User=netrich
WorkingDirectory=/opt/netrich/office365/backend
EnvironmentFile=/opt/netrich/office365/backend/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/npx tsx apps/worker/src/main.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/nt-office365-web.service`:

```ini
[Unit]
Description=netrichtechnologies Microsoft 365 Control Panel UI
After=nt-office365-api.service

[Service]
Type=simple
User=netrich
WorkingDirectory=/opt/netrich/office365
EnvironmentFile=/opt/netrich/office365/.env.production
Environment=NODE_ENV=production
ExecStart=/usr/bin/npx next start -p 3000 -H 127.0.0.1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo chmod 600 /opt/netrich/office365/.env.production /opt/netrich/office365/backend/.env
sudo systemctl daemon-reload
sudo systemctl enable --now nt-office365-api nt-office365-worker nt-office365-web
sudo systemctl status nt-office365-api nt-office365-worker nt-office365-web
```

### One-shot start (smoke only)

```powershell
cd C:\netrich\office365
npm run deploy:start
```

This is `next start` in the foreground after a build. Use it to prove the UI boots, then switch to NSSM/systemd.

---

## 14. Reverse proxy

The proxy must:

1. Terminate TLS for `office365.cp.netrichtechnologies.com`.
2. Proxy `/` to `http://127.0.0.1:3000`.
3. Set `X-Real-IP` to the client (Next rate limits use this when `TRUST_PROXY=true`; it does **not** trust `X-Forwarded-For` unless you change code).
4. Set `X-Forwarded-Proto https` and `X-Forwarded-Host`.
5. **Not** proxy `/v1` or `:8080` to the internet.
6. **Not** set `Domain=` on cookies.
7. Allow WebSockets if you add them later (`Upgrade` headers).
8. Raise body size for catalog/import POSTs (e.g. 10 MB).

### Nginx (Linux or Windows Nginx)

`/etc/nginx/sites-available/office365.cp.netrichtechnologies.com`:

```nginx
upstream nt_office365_web {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name office365.cp.netrichtechnologies.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name office365.cp.netrichtechnologies.com;

    ssl_certificate     /etc/ssl/certs/office365.cp.netrichtechnologies.com.crt;
    ssl_certificate_key /etc/ssl/private/office365.cp.netrichtechnologies.com.key;
    ssl_session_timeout 1d;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    client_max_body_size 10m;

    location / {
        proxy_pass http://nt_office365_web;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/office365.cp.netrichtechnologies.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Let’s Encrypt:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d office365.cp.netrichtechnologies.com
```

### IIS (Windows Server)

1. Install **IIS**, **URL Rewrite**, **Application Request Routing (ARR)**.
2. IIS Manager → server node → Application Request Routing Cache → Server Proxy Settings → **Enable proxy**. Uncheck “Reverse rewrite host in response headers” if cookies break.
3. Create a site `office365.cp.netrichtechnologies.com` with an HTTPS binding and your certificate. HTTP binding should redirect to HTTPS.
4. Add `web.config` at the IIS site root (this is the **proxy site**, not the Next.js folder):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="HTTPS redirect" stopProcessing="true">
          <match url="(.*)" />
          <conditions>
            <add input="{HTTPS}" pattern="off" />
          </conditions>
          <action type="Redirect" url="https://{HTTP_HOST}/{R:1}" redirectType="Permanent" />
        </rule>
        <rule name="ReverseProxyToNext" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:3000/{R:1}" />
          <serverVariables>
            <set name="HTTP_X_REAL_IP" value="{REMOTE_ADDR}" />
            <set name="HTTP_X_FORWARDED_PROTO" value="https" />
          </serverVariables>
        </rule>
      </rules>
    </rewrite>
    <httpProtocol>
      <customHeaders>
        <add name="Strict-Transport-Security" value="max-age=63072000; includeSubDomains; preload" />
      </customHeaders>
    </httpProtocol>
    <security>
      <requestFiltering>
        <requestLimits maxAllowedContentLength="10485760" />
      </requestFiltering>
    </security>
  </system.webServer>
</configuration>
```

Allow the server variables `HTTP_X_REAL_IP` and `HTTP_X_FORWARDED_PROTO` under URL Rewrite → View Server Variables.

Do **not** publish a second IIS site for port 8080.

---

## 15. First Super Admin and break-glass

1. Set `PORTAL_BOOTSTRAP_ADMIN_EMAIL` to the UPN of the first Partner Super Admin (for example `omar.barkan@netrichtechnologies.com`). It must **not** be `admin@netrichtechnologies.com`.
2. Open `https://office365.cp.netrichtechnologies.com`.
3. **Sign in with Microsoft**. Entra MFA / Conditional Access is the primary MFA.
4. On first success, Next.js creates a `partner_admin` in `.data/portal-accounts.json` and binds the Entra `oid`.
5. That user provisions all other portal accounts under **Partner Control Center → Users**. Client tenants stay `pending` until Super Admin approves them.

### Break-glass (emergency password + TOTP)

Everyday Microsoft admins must **not** use portal passwords. Break-glass is for allow-listed emergency emails only.

```powershell
cd C:\netrich\office365
node scripts\set-superadmin-password.mjs --email your.breakglass@netrichtechnologies.com --generate --reset-mfa
```

Store the generated password in a physical / offline safe. Enroll TOTP (Microsoft Authenticator) on first emergency login. After use, rotate the password.

---

## 16. Health checks and go-live

Run these from the host (not from the internet for Nest).

```powershell
# Nest — public health is unauthenticated and does not leak Redis/SAM
Invoke-RestMethod http://127.0.0.1:8080/health
# expected: { ok: true, service: "netrich-csp-api" }

# Next through the proxy
Invoke-WebRequest https://office365.cp.netrichtechnologies.com/ -UseBasicParsing

# Confirm Nest is NOT public
# From a machine off the host, this must fail:
# Invoke-RestMethod http://office365.cp.netrichtechnologies.com:8080/health
```

After login as Super Admin, Partner Control Center → Microsoft integration / platform health should show `source: "nest"` on `/api/csp/health`. If you see `503` with `BACKEND_REQUIRED`, Nest is down or `CSP_API_URL` is wrong.

`GET /health/details` on Nest requires a partner session (not public). Use the UI.

### Cookie check (browser DevTools)

- Name: `__Host-nt_portal_session`
- HttpOnly, Secure, SameSite=Lax, Path=/
- No Domain attribute

### Entra check

Sign-in redirect stays on `https://office365.cp.netrichtechnologies.com`. Token verification uses JWKS at `https://login.microsoftonline.com/<tid>/discovery/v2.0/keys`.

---

## 17. Updates and redeploy

```powershell
cd C:\netrich\office365
git fetch
git pull --ff-only

# UI
npm ci
npm run deploy:check
npm run deploy:build

# API
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build   # optional if you run via tsx

Restart-Service nt-office365-api, nt-office365-worker, nt-office365-web
```

Linux:

```bash
cd /opt/netrich/office365
sudo -u netrich git pull --ff-only
sudo -u netrich -H bash -lc 'npm ci && npm run deploy:check && npm run deploy:build'
cd backend
sudo -u netrich -H bash -lc 'npm ci && npx prisma generate && npx prisma migrate deploy'
sudo systemctl restart nt-office365-api nt-office365-worker nt-office365-web
```

Order: migrate Postgres **before** restarting Nest if the new code requires new columns.

Never run `prisma migrate dev` or `prisma db push` in production. Only `prisma migrate deploy`.

---

## 18. Backups

| Data | Location | Method |
|------|----------|--------|
| CSP SoR | PostgreSQL `netrich_csp` | `pg_dump` daily + WAL archive if 24×7 |
| Portal accounts, MFA, passwords, sessions, support, catalog | `.data/` | File-level backup (volume snapshot or robocopy/rsync) |
| Secrets | `.env.production`, `backend/.env` | Offline password manager / vault — **not** in Git |
| TLS certs | IIS / `/etc/ssl` | Standard cert ops |

PostgreSQL (Windows Task Scheduler / Linux cron, retain 14 days):

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$out = "C:\netrich\backups\pg-$stamp.dump"
New-Item -ItemType Directory -Force -Path C:\netrich\backups | Out-Null
$env:PGPASSWORD = "<netrich-db-password>"
pg_dump -U netrich -h 127.0.0.1 -d netrich_csp -Fc -f $out
```

```powershell
robocopy C:\netrich\office365\.data C:\netrich\backups\data-$stamp /E /R:2 /W:5
```

Encrypt backup files at rest. Test a restore on a staging VM **before** you need it.

Restore sketch:

```powershell
# Stop API/worker/web first
pg_restore -U netrich -h 127.0.0.1 -d netrich_csp --clean --if-exists $out
# restore .data over the live folder, then start services
```

---

## 19. Logging, monitoring, and operations

| Source | Where |
|--------|-------|
| Next.js | NSSM `logs\web.*.log` or `journalctl -u nt-office365-web` |
| Nest | `logs\api.*.log` — `[api] listening on http://localhost:8080` |
| Worker | `logs\worker.*.log` — `[worker] listening on redis://…` |
| IIS | `%SystemDrive%\inetpub\logs\LogFiles` |
| Nginx | `/var/log/nginx/access.log` |
| Postgres | EDB logs / `journalctl -u postgresql` |

Watch for:

- Nest crash: `CSP_INTERNAL_API_SECRET must be a unique value` or `PORTAL_SESSION_SECRET must be…` — secrets missing or still the published default.
- UI `503 BACKEND_REQUIRED` — API down, wrong `CSP_API_URL`, or Postgres down (`/health` `ok: false`).
- Entra `TOKEN_INVALID` — audience / client ID mismatch, wrong redirect URI, or JWKS blocked outbound.
- Rate limit `429` on `/api/auth/entra` — 12 attempts / minute / IP; `TRUST_PROXY` must see the real client in `X-Real-IP`.

Recommended external monitors (no containers required):

- Uptime check on `https://office365.cp.netrichtechnologies.com` (HTTP 200)
- Host check on `http://127.0.0.1:8080/health` via a local probe
- Disk on `.data` and Postgres data directory
- Windows Performance / Prometheus node exporter if you already run one as a native service

---

## 20. Security hardening

| Control | Production setting |
|---------|--------------------|
| Identity | Entra SSO + Conditional Access. Password + TOTP = break-glass only |
| Session | HMAC cookie, 12 h partner / 30 min client, server-side revoke in `.data/portal-sessions.json` |
| Isolation | Next middleware + Nest guards + PostgreSQL RLS `FORCE` |
| Nest exposure | Loopback only; internal secret; no public `/v1` |
| Secrets | Unique `PORTAL_SESSION_SECRET` / `CSP_INTERNAL_API_SECRET`; OS file ACL 600 / Administrators-only |
| Headers | Next already sets CSP, HSTS, `X-Frame-Options DENY`, `nosniff`, `COOP` |
| Graph | HTTPS host allow-list `graph.microsoft.com` only |
| Partner Center | HTTPS host allow-list `api.partnercenter.microsoft.com`; writes gated |
| Webhooks | `WEBHOOK_SECRET` HMAC on `/api/webhooks/:provider` (public by design — keep signature checks on) |
| OS | Patch monthly; no RDP/SSH from internet; service account is not Domain Admin |
| DB | App role is not superuser; `pg_hba` localhost + scram-sha-256 |

Partner Center **writes** remain disabled until you explicitly set `PARTNER_CENTER_WRITES_ENABLED=true` after Phase 2 read-only is solid.

---

## 21. Production checklist

Print and tick this on go-live day.

- [ ] No Docker / Compose / Kubernetes installed for this app
- [ ] DNS `office365.cp.netrichtechnologies.com` → this host
- [ ] TLS certificate valid; HTTP → HTTPS
- [ ] Firewall: 443 (and 80 redirect) only from internet
- [ ] PostgreSQL 16 on `127.0.0.1:5432`, role `netrich` is **not** superuser
- [ ] `prisma migrate deploy` applied; RLS helpers + FORCE policies present
- [ ] Redis/Memurai on `127.0.0.1:6379`
- [ ] `.env.production` and `backend/.env` exist, mode `600`, **not** in Git
- [ ] `npm run deploy:check` passes
- [ ] `PORTAL_SESSION_SECRET` identical in both env files, ≥32 chars
- [ ] `CSP_INTERNAL_API_SECRET` identical in both env files, ≥16 chars
- [ ] `CSP_API_URL=http://127.0.0.1:8080`
- [ ] `NEXT_PUBLIC_CSP_API_URL` unset
- [ ] `GRAPH_ACCESS_TOKEN` unset
- [ ] `ALLOW_DEMO_LOGIN` unset / not `true`
- [ ] `PORTAL_BOOTSTRAP_ADMIN_EMAIL` is a real UPN, not `admin@netrichtechnologies.com`
- [ ] Entra SPA redirect URI = production HTTPS origin
- [ ] `NEXT_PUBLIC_AZURE_AD_CLIENT_ID` and `AZURE_AD_API_AUDIENCE` set
- [ ] Next, Nest, worker registered as OS services, start on boot
- [ ] `GET http://127.0.0.1:8080/health` → `{ ok: true }`
- [ ] Public site loads; Sign in with Microsoft works
- [ ] After login, CSP health is `source: nest`
- [ ] Cookie `__Host-nt_portal_session` is Secure / HttpOnly
- [ ] Port 8080 closed from the internet
- [ ] `.data` and Postgres backups scheduled and a restore tested
- [ ] Break-glass mailbox documented offline; TOTP enrolled
- [ ] `PARTNER_CENTER_WRITES_ENABLED=false` unless Phase 3 is approved

---

## 22. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `deploy:check` fails on session secret | Too short or published default | `npm run deploy:secret` and paste |
| Nest exits immediately | `assertHardenedSecrets()` | Match secrets; `NODE_ENV=production` |
| UI boots, CSP pages 503 `BACKEND_REQUIRED` | Nest down, Postgres down, or `CSP_API_URL` points at a Docker hostname | Use `http://127.0.0.1:8080`; start `nt-office365-api`; `psql` locally |
| `GET /health` `ok: false` | Postgres unreachable | `DATABASE_URL`, `pg_isready`, service running |
| Sign-in “token could not be verified” | Audience / client ID / tenant | Align Entra app ID with `NEXT_PUBLIC_AZURE_AD_CLIENT_ID` and `AZURE_AD_API_AUDIENCE` |
| Sign-in loops / cookie missing | HTTP or wrong host | Site must be HTTPS; cookie is `__Host-` prefixed |
| Rate limit hits everyone as one IP | Proxy not setting `X-Real-IP` while `TRUST_PROXY=true` | Set `X-Real-IP` (not only `X-Forwarded-For`) |
| Worker idle, jobs stay queued | Redis URL wrong | Align `REDIS_URL`; `redis-cli ping` |
| Graph always `GRAPH_NOT_CONFIGURED` | Missing client id/secret/tenant | Set `GRAPH_*`; tenant must not be `common` for app-only |
| IIS 502.3 | Next not listening | `Get-Service nt-office365-web`; `netstat -ano \| findstr :3000` |
| `EACCES` writing `.data` | Service account ACL | Grant Modify on `.data` to the service user |
| Duplicate session / logout fails | Multiple Next instances without shared `.data` | One Next process, or put `.data` on a shared disk (single-writer) |

Local JSON **must not** serve `/api/csp/*` in production. If a page shows `"source":"local"` on CSP routes, `NODE_ENV` is not `production` or you are hitting a non-prod build.

---

## 23. Environment variable catalog

### Next.js (`.env.production`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `NODE_ENV` | yes | `production` |
| `PORT` | yes | `3000` |
| `HOSTNAME` | yes | `127.0.0.1` (or `0.0.0.0` behind a host firewall) |
| `NEXT_PUBLIC_APP_URL` | yes | `https://office365.cp.netrichtechnologies.com` |
| `NEXT_PUBLIC_APP_DOMAIN` | yes | `office365.cp.netrichtechnologies.com` |
| `NEXT_PUBLIC_AZURE_AD_CLIENT_ID` | yes | Entra SPA application ID |
| `NEXT_PUBLIC_AZURE_AD_AUTHORITY` | yes | `https://login.microsoftonline.com/<tenant-id>` |
| `AZURE_AD_TENANT_ID` | yes | Partner directory ID (tid check for partner_admin) |
| `AZURE_AD_API_AUDIENCE` | yes | JWT audience (SPA id or api:// URI) |
| `AZURE_AD_CLIENT_SECRET` | no | Only if you add a confidential Next flow (not used for MSAL SPA) |
| `CSP_API_URL` | yes | `http://127.0.0.1:8080` |
| `CSP_INTERNAL_API_SECRET` | yes | Shared with Nest, ≥16 chars |
| `PORTAL_SESSION_SECRET` | yes | HMAC key, ≥32 chars |
| `PORTAL_BOOTSTRAP_ADMIN_EMAIL` | recommended | First Super Admin UPN |
| `TRUST_PROXY` | yes behind IIS/Nginx | `true` — trust `X-Real-IP` |
| `WEBHOOK_SECRET` | if using inbound webhooks | HMAC of raw body |
| `PARTNER_CENTER_APP_ID` / `ACCOUNT_ID` / `MODE` | optional | UI placeholders; live tokens live on Nest |
| `NEXT_PUBLIC_CSP_API_URL` | **forbidden** | Do not set |
| `GRAPH_ACCESS_TOKEN` | **forbidden** | Do not set |
| `ALLOW_DEMO_LOGIN` | **forbidden** | Do not set `true` |

### Nest (`backend/.env`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `NODE_ENV` | yes | `production` |
| `PORT` | yes | `8080` |
| `DATABASE_URL` | yes | Postgres URL, non-superuser |
| `REDIS_URL` | yes | Redis / Memurai |
| `PORTAL_SESSION_SECRET` | yes | **Same** as Next |
| `CSP_INTERNAL_API_SECRET` | yes | **Same** as Next |
| `CORS_ORIGINS` | yes | Production UI origin |
| `AZURE_AD_TENANT_ID` | recommended | JWKS hint |
| `AZURE_AD_API_AUDIENCE` | recommended | If you ever validate Entra on Nest |
| `AZURE_AD_SPA_CLIENT_ID` | recommended | SPA id |
| `GRAPH_CLIENT_ID` / `SECRET` / `TENANT_ID` | Phase 2 | App-only Graph |
| `PARTNER_CENTER_APP_ID` / `SECRET` / `TENANT_ID` | Phase 2 | Read-only PC |
| `PARTNER_CENTER_WRITES_ENABLED` | no | Default `false` |
| `PARTNER_CENTER_MODE` | no | `sandbox` until go-live commerce |
| `AZURE_KEY_VAULT_URI` | Phase 2+ | SAM certificates |
| `WEBHOOK_SECRET` / `WEBHOOK_CLIENT_STATE` | optional | Signed ingress |

---

## Document control

| | |
|---|---|
| **Audience** | Production operators, partner Super Admins, hosting |
| **Runtime** | Native Windows Server or Linux — **no containerization** |
| **Domain** | `https://office365.cp.netrichtechnologies.com` |
| **Updated** | 2026-09-19 |

### Files in this repository

| Path | Purpose |
|------|---------|
| `docs/DEPLOYMENT.md` | This runbook |
| `.env.production.example` | Next.js production env template |
| `backend/.env.production.example` | Nest / worker / Prisma production env template |
| `scripts/deploy-production.mjs` | `--check` / `--build` / `--start` |
| `scripts/windows/start-web.cmd` | NSSM entry for Next.js |
| `scripts/windows/start-api.cmd` | NSSM entry for Nest |
| `scripts/windows/start-worker.cmd` | NSSM entry for BullMQ worker |
| `scripts/windows/iis-web.config` | IIS reverse-proxy site |
| `scripts/linux/nt-office365-*.service` | systemd units |
| `scripts/linux/office365.cp.netrichtechnologies.com.conf` | Nginx site |

*Audited against `scripts/deploy-production.mjs`, `src/lib/auth/runtime.ts`, `backend/libs/runtime.ts`, Nest `main.ts` / guards, Prisma RLS, and `.env.production.example`.*
