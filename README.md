# netrichtechnologies — Microsoft 365 Control Panel

Multi-tenant CSP control panel for **netrichtechnologies**.

**Production domain:** `https://office365.cp.netrichtechnologies.com`

| Maturity | Status |
|----------|--------|
| **MVP UI** | Live — Next.js portal, Entra SSO, local commerce, hard isolation |
| **Phase 1 Foundation** | In-repo — NestJS/Prisma, Entra session mint, SAM/Graph token path when configured, GDAP/onboarding, local commerce + NCE rules, jobs/notifications APIs |
| **Phase 2–3** | Live Graph / Partner Center when credentials are set; NCE Partner Center writes remain disabled until `PARTNER_CENTER_WRITES_ENABLED=true` |

## Documentation index

| Document | Description |
|----------|-------------|
| **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** | **Production deploy (native Windows/Linux — no Docker)** |
| **[docs/DOCUMENTATION.md](./docs/DOCUMENTATION.md)** | Full system doc — modules, APIs, stores, security |
| **[docs/CSP_PRODUCTION_ARCHITECTURE.md](./docs/CSP_PRODUCTION_ARCHITECTURE.md)** | CSP target architecture (SAM, GDAP, NCE, stages) |
| **[docs/MULTI_TENANT.md](./docs/MULTI_TENANT.md)** | Isolation policy, terminate lifecycle, try-it |
| **[docs/BACKEND.md](./docs/BACKEND.md)** | NestJS + PostgreSQL design & roadmap |
| **[backend/README.md](./backend/README.md)** | Nest API / worker / Prisma quick start |

## Features

| Area | What works today |
|------|------------------|
| **Sign-in** | Microsoft Entra SSO · break-glass password + TOTP for allow-listed emergency emails |
| **Partner Control Center** | Overview/reporting, customers, onboarding, GDAP, catalog, pricing, quotes, orders, renewals, invoices, jobs/DLQ, roles, approvals, break-glass, graph-sync, audit, flags |
| **Client workspace** | Dashboard, users (create/block/licenses), products, domains, service health, billing, renewals, security, notifications, sessions, organization, administrators, audit |
| **Tenancy** | Signed session, portal lock, scoped APIs, soft **TERMINATING** lifecycle + four-eyes, view-as-customer (audited) |
| **Foundation API** | NestJS `:8080` + Postgres · Next BFF `/api/csp/*` + `.data/platform.json` / `foundation.json` without Docker |
| **Support** | Client chat + Technical/Billing agent inbox |

## Quick start — UI

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

1. **Sign in with Microsoft** (`NEXT_PUBLIC_AZURE_AD_CLIENT_ID` required in production).
2. Super Admin provisions portal accounts before first Entra sign-in. Emergency access is break-glass only (unique password + TOTP).
3. Tenants are never listed on the public login page.

### Partner Control Center URLs

| Path | Purpose |
|------|---------|
| `/admin` | Overview |
| `/admin/tenants` | All customers — approve / disable / terminate |
| `/admin/tenants/[id]` | Configure, onboarding, GDAP, Client Admins, view-as |
| `/admin/onboarding` | 12-step onboarding board |
| `/admin/gdap` | GDAP relationships & expiry |
| `/admin/users` | Portal users — edit, password, MFA, disable, delete |
| `/admin/catalog` | Catalog & pricing |
| `/admin/microsoft/integration` | SAM / platform health |
| `/admin/security/audit` | Audit logs |
| `/admin/platform/flags` | Feature flags |

## Production (native — no Docker)

Full runbook: **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)**.

Production runs **Next.js + NestJS + PostgreSQL 16 + Redis as OS processes** behind IIS or Nginx. Containers are not used.

```powershell
copy .env.production.example .env.production
copy backend\.env.production.example backend\.env
npm run deploy:secret   # paste into both env files (session + internal secret)
npm run deploy:check
npm run deploy:build
# Then register Windows services (NSSM) or Linux systemd — see the runbook.
```

## Quick start — NestJS + PostgreSQL (local development)

Install PostgreSQL 16 and Redis 7 (or Memurai on Windows) on the machine. Production never uses Docker for these services.

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
# optional RLS policies: psql "$DATABASE_URL" -f prisma/rls-policies.sql
npm run prisma:seed
npm run migrate:from-data   # import ../.data JSON
npm run dev:api             # http://localhost:8080/health
# optional
npm run dev:worker
```

If Nest is down in **development**, `/api/csp/*` can fall back to `.data`. In **production** that fallback is disabled (`503 BACKEND_REQUIRED`).

## Environment

Root [`.env.example`](./.env.example) and [backend/.env.example](./backend/.env.example).

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_AZURE_AD_CLIENT_ID=
NEXT_PUBLIC_AZURE_AD_AUTHORITY=https://login.microsoftonline.com/common
CSP_API_URL=http://127.0.0.1:8080
# PORTAL_SESSION_SECRET=     # required in production (≥32 chars)
# Production: do not set NEXT_PUBLIC_CSP_API_URL (Nest stays off the browser bundle).
```

## Scripts (UI package)

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js development server |
| `npm run build` | Production build |
| `npm start` | Run production UI |
| `npm run lint` | ESLint |
| `npm run deploy:check` | Validate `.env.production` |
| `npm run deploy:build` | Install + production Next.js build |
| `npm run deploy:start` | Build + `next start` (foreground smoke) |

## Brand

**netrichtechnologies** · **Microsoft 365 Control Panel**

Architecture stages and Microsoft references: **[docs/CSP_PRODUCTION_ARCHITECTURE.md](./docs/CSP_PRODUCTION_ARCHITECTURE.md)**.
