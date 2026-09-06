# netrichtechnologies CSP Backend

Phase 1 **Foundation** API for the Microsoft 365 Control Panel.

| Service | Port / role |
|---------|-------------|
| **API** (`apps/api`) | `:8080` — NestJS REST under `/v1` (+ `/health`) |
| **Worker** (`apps/worker`) | BullMQ stub consumers |
| **PostgreSQL** | System of record + RLS helpers |
| **Redis** | Job queues / cache |

UI remains Next.js (`:3000`). The Next BFF at `/api/csp/*` prefers this API and falls back to `.data/foundation.json` if Nest/Postgres are down.

Full architecture: [docs/CSP_PRODUCTION_ARCHITECTURE.md](../docs/CSP_PRODUCTION_ARCHITECTURE.md) · [docs/BACKEND.md](../docs/BACKEND.md)

## Prerequisites

- Node.js 20+
- Docker Desktop (Postgres + Redis)

## Quick start

```bash
cd backend
cp .env.example .env
npm install
npm run docker:up
npx prisma migrate deploy
psql "$DATABASE_URL" -f prisma/rls-policies.sql   # optional; functions also in prisma/rls.sql
npm run prisma:seed
npm run migrate:from-data   # optional: import ../.data/*.json
npm run dev:api
```

Health: [http://localhost:8080/health](http://localhost:8080/health)

Worker (optional second terminal):

```bash
npm run dev:worker
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run docker:up` / `docker:down` | Start/stop Postgres + Redis |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Dev migrations |
| `npm run prisma:deploy` | Apply migrations |
| `npm run prisma:seed` | Seed partner, RBAC, flags |
| `npm run migrate:from-data` | Import Next `.data` JSON → Postgres |
| `npm run dev:api` / `start:api` | Nest API watch / once |
| `npm run dev:worker` / `start:worker` | Worker watch / once |
| `npm run build` | `tsc` compile |

## Environment

See [`.env.example`](./.env.example).

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection |
| `REDIS_URL` | Redis for BullMQ |
| `PORT` | API port (default `8080`) |
| `CORS_ORIGINS` | Next UI origin(s) |
| `AZURE_AD_API_AUDIENCE` | Entra access-token audience (required for live Entra validation) |
| `AZURE_AD_TENANT_ID` | Tenant hint for JWKS |
| `AZURE_KEY_VAULT_URI` | SAM / Key Vault (Phase 1 status only) |
| `PARTNER_CENTER_MODE` | `sandbox` (writes disabled) |

## API surface (Phase 1)

Global prefix: `/v1` (except `/health`).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Postgres / Redis / SAM component status |
| `GET` | `/v1/auth/me` | Entra Bearer → portal user |
| `POST` | `/v1/auth/session` | Create DB session from Entra token |
| `POST` | `/v1/auth/logout` | Revoke session(s) |
| `GET` | `/v1/customers` | List customers (+ onboarding summary) |
| `GET` | `/v1/customers/:id` | Customer, Microsoft tenants, GDAP, onboarding |
| `GET` | `/v1/gdap` | GDAP relationships (optional `?expiringWithinDays=`) |
| `GET`/`PATCH` | `/v1/onboarding/...` | Onboarding steps |
| `GET` | `/v1/rbac/permissions` | Permission catalog |
| `GET` | `/v1/rbac/roles` | Role packs + DB roles |
| `GET` | `/v1/flags` | Feature flags |
| `GET` | `/v1/microsoft/integration` | SAM / Key Vault status (no secrets) |
| `GET` | `/v1/audit` | Compliance audit events |
| `POST` | `/v1/admin-access` | Start view-as-customer session |
| `GET`/`POST` | `/v1/approvals` | Privileged-op approval stubs |

## Layout

```
backend/
  apps/api/src/       Nest controllers + request-id middleware
  apps/worker/src/    BullMQ stub worker
  libs/               prisma, entra, sam, rbac, guards
  prisma/             schema, migrations, seed, rls*.sql
  scripts/            migrate-from-data.ts
  docker-compose.yml
```

## Important rules

- **No Partner Center write commerce** in Phase 1.
- Auth for Microsoft APIs is **per-operation** (App+User + GDAP consent vs partner app credentials) — not universal “app-only + GDAP”.
- Demo email/TOTP stays on the **Next.js** app for local use; Nest Entra path is the production identity model.
- Secrets belong in **Key Vault**, not Git or plaintext Postgres.

## Next.js bridge

With `NEXT_PUBLIC_CSP_API_URL=http://localhost:8080`, Partner Control Center pages call `/api/csp/*`, which proxies to Nest when healthy.
