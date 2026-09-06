# netrichtechnologies — Microsoft 365 Control Panel

Multi-tenant CSP control panel for **netrichtechnologies**.

**Production domain:** `https://office365.cp.netrichtechnologies.com`

| Maturity | Status |
|----------|--------|
| **MVP UI** | Live — Next.js portal, demo auth, local commerce, hard isolation |
| **Phase 1 Foundation** | Complete (local SoR) — NestJS/Prisma, Entra-primary path, SAM stubs, GDAP/onboarding, price/quotes/renewals, jobs/DLQ, sessions, notifications, security, approvals, break-glass |
| **Phase 2–3** | Planned — live Graph / Partner Center read-only, then NCE commerce |

## Documentation index

| Document | Description |
|----------|-------------|
| **[docs/DOCUMENTATION.md](./docs/DOCUMENTATION.md)** | Full system doc — modules, APIs, stores, security |
| **[docs/CSP_PRODUCTION_ARCHITECTURE.md](./docs/CSP_PRODUCTION_ARCHITECTURE.md)** | CSP target architecture (SAM, GDAP, NCE, stages) |
| **[docs/MULTI_TENANT.md](./docs/MULTI_TENANT.md)** | Isolation policy, terminate lifecycle, try-it |
| **[docs/BACKEND.md](./docs/BACKEND.md)** | NestJS + PostgreSQL design & roadmap |
| **[backend/README.md](./backend/README.md)** | Nest API / worker / Prisma quick start |

## Features

| Area | What works today |
|------|------------------|
| **Sign-in** | Microsoft Entra SSO (when client ID set) · Demo email + password + TOTP MFA (local) |
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

1. **Sign in with Microsoft** if `NEXT_PUBLIC_AZURE_AD_CLIENT_ID` is set.
2. Or demo: `admin@netrichtechnologies.com` / `demo` → Google Authenticator MFA.
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

## Quick start — NestJS + PostgreSQL

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
cd backend
cp .env.example .env
npm install
npm run docker:up
npx prisma migrate deploy
# optional RLS policies: psql "$DATABASE_URL" -f prisma/rls-policies.sql
npm run prisma:seed
npm run migrate:from-data   # import ../.data JSON
npm run dev:api             # http://localhost:8080/health
# optional
npm run dev:worker
```

Without Docker, the UI still runs; `/api/csp/*` uses the local foundation store.

## Environment

Root [`.env.example`](./.env.example) and [backend/.env.example](./backend/.env.example).

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_CSP_API_URL=http://localhost:8080
NEXT_PUBLIC_AZURE_AD_CLIENT_ID=
NEXT_PUBLIC_AZURE_AD_AUTHORITY=https://login.microsoftonline.com/common
# PORTAL_SESSION_SECRET=     # required in production (≥32 chars)
# ALLOW_DEMO_LOGIN=true
# DEMO_LOGIN_PASSWORD=demo
```

## Scripts (UI package)

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js development server |
| `npm run build` | Production build |
| `npm start` | Run production UI |
| `npm run lint` | ESLint |

## Brand

**netrichtechnologies** · **Microsoft 365 Control Panel**

Architecture stages and Microsoft references: **[docs/CSP_PRODUCTION_ARCHITECTURE.md](./docs/CSP_PRODUCTION_ARCHITECTURE.md)**.
