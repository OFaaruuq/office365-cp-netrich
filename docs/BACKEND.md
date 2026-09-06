# netrichtechnologies — Backend Documentation

> **Status:** Target NestJS + PostgreSQL architecture **and** what is live in-repo for **Phase 1 Foundation**.
>
> **Running today**
> - Next.js UI + Route Handlers (auth/MFA, admin, workspace, commerce, support) with `.data/*.json`
> - NestJS API + Prisma schema + docker-compose Postgres/Redis under [`backend/`](../backend/)
> - Next BFF `/api/csp/*` → Nest `/v1/*` with foundation.json fallback
>
> Live runbooks: [backend/README.md](../backend/README.md) · [DOCUMENTATION.md](./DOCUMENTATION.md) · [MULTI_TENANT.md](./MULTI_TENANT.md) · [CSP_PRODUCTION_ARCHITECTURE.md](./CSP_PRODUCTION_ARCHITECTURE.md)

**Multi-tenant CSP Control Panel · PostgreSQL · Microsoft Graph · Partner Center · External Integrations**

| | |
|---|---|
| **Product** | netrichtechnologies Microsoft 365 Control Panel |
| **Frontend / BFF** | Next.js (`office365.cp.netrichtechnologies.com`, local `:3000`) |
| **Backend API** | NestJS in `backend/apps/api` (`api.office365.cp…`, local `:8080`) |
| **Database** | PostgreSQL (Prisma) — Foundation; `.data` remains MVP dual-write bridge |
| **Cache / queue** | Redis + BullMQ worker stubs |
| **Identity** | Entra access-token validation (Nest) + Next demo email/TOTP · production = Entra MFA claims |

### Live API surface (today)

| Group | Paths |
|-------|--------|
| Next Auth | `/api/auth/session`, `/api/auth/mfa`, `/api/auth/personas` |
| Next Admin | `/api/admin/customers`, `/api/admin/users`, `/api/admin/catalog`, `/api/admin/audit` |
| Next CSP BFF | `/api/csp/*` → Nest `/v1/*` or `.data/foundation.json` |
| Next Workspace | `/api/me/*`, `/api/users`, `/api/products`, `/api/subscriptions`, `/api/commerce/subscribe` |
| Next Support | `/api/support/threads`, `/api/chat` |
| Nest Foundation | `/health`, `/v1/auth/*`, `/v1/customers`, `/v1/gdap`, `/v1/onboarding`, `/v1/rbac`, `/v1/flags`, `/v1/microsoft/integration`, `/v1/audit`, `/v1/admin-access`, `/v1/approvals` |

---

## Table of contents

1. [Backend recommendation (Python/Flask vs NestJS vs .NET)](#1-backend-recommendation-pythonflask-vs-nestjs-vs-net)
2. [Goals & principles](#2-goals--principles)
3. [High-level architecture](#3-high-level-architecture)
4. [Multi-tenancy model](#4-multi-tenancy-model)
5. [PostgreSQL schema](#5-postgresql-schema)
6. [API design](#6-api-design)
7. [Microsoft integrations](#7-microsoft-integrations)
8. [External application integrations](#8-external-application-integrations)
9. [Background jobs & sync](#9-background-jobs--sync)
10. [Security](#10-security)
11. [Performance](#11-performance)
12. [Environments & config](#12-environments--config)
13. [Implementation roadmap](#13-implementation-roadmap)
14. [Folder structure (recommended)](#14-folder-structure-recommended)

---

## 1. Backend recommendation (Python/Flask vs NestJS vs .NET)

### Short answer

**You do not need Python or Flask for this project.**

Best fit for **security + speed + multi-tenant CSP + many integrations**:

| Rank | Stack | Verdict |
|------|--------|---------|
| **1 (recommended)** | **NestJS (Node.js / TypeScript) + PostgreSQL** | Best overall fit with your Next.js frontend |
| **2** | **ASP.NET Core + PostgreSQL** | Excellent if the team prefers C# / deepest Microsoft SDKs |
| **3** | **Next.js Route Handlers + workers** | OK for MVP only; harder for long sync jobs & many integrations |
| **Not recommended** | **Flask** | Too minimal for multi-tenant enterprise + queues + strong typing |
| **Optional later** | **FastAPI (Python)** | Fine for ML/reporting microservices, not the main portal API |

### Why NestJS (not Flask)

| Concern | NestJS | Flask | ASP.NET Core |
|---------|--------|-------|--------------|
| Same language as frontend | Yes (TypeScript) | No | No |
| Multi-tenant modules / DI | Excellent | Manual | Excellent |
| Security middleware, guards, RBAC | Built-in patterns | DIY | Built-in |
| Background jobs (sync, renewals) | BullMQ / Nest Schedule | Celery (extra stack) | Hangfire / Workers |
| Microsoft Graph SDK | Official JS SDK | Python SDK | First-class .NET SDK |
| Partner Center | REST + JS | REST + Python | Strong .NET samples |
| Throughput for API | High (async Node) | Good with gunicorn | Very high |
| Team velocity with current UI | Highest | Lower | Medium if no C# team |

### Recommended topology

```
Browser (Next.js UI)
        │
        ▼
Next.js BFF (optional thin proxy / SSR)
        │
        ▼
NestJS API  ──────────────────────────────────────┐
  • Auth / tenancy / RBAC                          │
  • REST + webhooks                                │
  • Writes PostgreSQL                              │
  • Enqueues jobs → Redis/BullMQ                   │
        │                                          │
        ├──────────── Microsoft Graph               │
        ├──────────── Partner Center                │
        ├──────────── Billing / Support / CRM …     │
        └──────────── PostgreSQL ◄──────────────────┘
```

**PostgreSQL is the correct database choice** for this product (relational tenancy, subscriptions, invoices, audit, strong constraints).

---

## 2. Goals & principles

1. **Everything dynamic** — UI reads from API/DB, not mock files.
2. **Multi-tenant isolation** — every query scoped by `customer_id` / `tenant_id`.
3. **CSP commerce** — sell/change seats via Partner Center; directory via Graph.
4. **Integration hub** — one backend orchestrates Microsoft + billing + support + CRM + monitoring.
5. **Async by default** — long syncs and webhooks never block HTTP requests.
6. **Audit everything** — license changes, logins, orders, admin actions.
7. **Least privilege** — certificates / Key Vault; short-lived user tokens; **per-operation** Graph/Partner Center auth (App+User vs app credentials — never “app-only + GDAP for everything”).

---

## 3. High-level architecture

### Services

| Service | Responsibility |
|---------|----------------|
| **api** (NestJS) | REST, auth, tenancy, business rules |
| **worker** | Graph sync, Partner Center sync, invoice import, recommendations |
| **webhook-ingress** | Partner Center / Graph / Stripe / Zendesk webhooks |
| **postgres** | System of record |
| **redis** | Sessions (optional), cache, job queues |
| **frontend** | Next.js control panel |

### Domains (bounded contexts)

```
Identity & Access
Tenancy (Customers / Tenants)
Directory Users
Subscriptions & Catalog
Orders & Billing
Security Posture
Support / Chat
Integrations Hub
Audit & Compliance
```

Each domain becomes a NestJS module with its own controllers, services, repositories.

---

## 4. Multi-tenancy model

### Entity hierarchy (CSP)

```
Partner: netrichtechnologies
   └── Customer (Company A)
         ├── Portal users (who log into YOUR panel)
         ├── Microsoft Tenant (contoso.onmicrosoft.com)
         ├── Subscriptions (M365, Dynamics, Azure plan…)
         ├── Directory users (synced from Graph)
         └── Invoices / tickets / integrations
```

### Isolation strategy (recommended)

**Shared database, shared schema, row-level tenancy** (simplest + proven for CSP portals):

- Every business table has `customer_id` (UUID, NOT NULL)
- All repositories force `WHERE customer_id = :currentCustomerId`
- Optional: PostgreSQL **Row Level Security (RLS)** as a second hard wall
- Partner Ops role may query across customers with explicit audit

Avoid “one database per customer” until you have hundreds of large enterprise clients and a clear ops need.

### Request context

After auth, attach:

```ts
{
  userId: string;
  customerId: string;
  tenantId: string;          // Microsoft tenant GUID
  roles: string[];           // CustomerAdmin | Billing | ReadOnly | PartnerOps
  partnerId: string;         // netrichtechnologies
}
```

Guards reject any request missing `customerId` (except PartnerOps admin routes).

---

## 5. PostgreSQL schema

### Core tables (logical)

```sql
-- Partner & customers
partners (id, name, slug, created_at)
customers (
  id, partner_id, name, legal_name, status,          -- active|suspended
  primary_domain, billing_email, created_at
)
microsoft_tenants (
  id, customer_id, tenant_guid, default_domain,
  gdap_status, last_graph_sync_at, last_pc_sync_at
)

-- Who logs into the control panel
portal_users (
  id, customer_id, entra_oid, email, display_name,
  role, is_active, last_login_at
)

-- Synced M365 directory
directory_users (
  id, customer_id, tenant_id, graph_user_id,
  display_name, email, upn, status,              -- active|blocked|pending|error
  licenses jsonb, raw jsonb, synced_at
)

-- Commerce
catalog_products (
  id, sku_id, product_family,                    -- m365|dynamics|azure|server
  name, description, filters jsonb,
  price_monthly, price_yearly, price_triennial,
  attach_monthly, attach_yearly, currency, is_active
)

subscriptions (
  id, customer_id, tenant_id,
  partner_center_subscription_id, sku_id, name,
  purchased, used, available,
  billing_cycle, commitment, unit_price, currency,
  next_renewal_at, status, has_alert, synced_at
)

orders (
  id, customer_id, status,                        -- draft|submitted|fulfilled|failed
  total_amount, currency, created_by, created_at
)
order_items (
  id, order_id, sku_id, quantity, unit_price, action  -- add|change|cancel
)

invoices (
  id, customer_id, partner_center_invoice_id,
  period_start, period_end, amount, currency,
  pdf_url, status, issued_at
)

-- Security snapshots
security_snapshots (
  id, customer_id, tenant_id,
  secure_score, mfa_percent, threat_count_30d,
  payload jsonb, captured_at
)

-- Support
support_threads (
  id, customer_id, portal_user_id, agent_name, status, created_at
)
support_messages (
  id, thread_id, sender, body, read_at, created_at
)

-- Integration connectors
integrations (
  id, customer_id, provider,                      -- zendesk|stripe|datadog|...
  config jsonb, secrets_ref, status, created_at
)

-- Ops
sync_runs (
  id, customer_id, tenant_id, job_type, status,
  started_at, finished_at, error, stats jsonb
)
audit_logs (
  id, customer_id, actor_user_id, action, entity,
  entity_id, before jsonb, after jsonb, ip, created_at
)

-- Recommendations engine output
product_recommendations (
  id, customer_id, sku_id, reason, score, status, created_at
)
```

### Indexes (critical)

- `(customer_id)` on all tenant tables  
- `(customer_id, email)` unique on `directory_users` / `portal_users`  
- `(tenant_guid)` unique on `microsoft_tenants`  
- `(customer_id, next_renewal_at)` on `subscriptions`  
- `(customer_id, created_at DESC)` on `audit_logs`, `sync_runs`

### RLS example

```sql
ALTER TABLE directory_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON directory_users
  USING (customer_id = current_setting('app.customer_id')::uuid);
```

Set `app.customer_id` per request in the DB session.

---

## 6. API design

Base URL: `https://api.office365.cp.netrichtechnologies.com/v1`

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/microsoft/callback` | Exchange Entra token → portal session JWT |
| `POST` | `/auth/logout` | Revoke session |
| `GET` | `/me` | Current user, customer, roles, tenant |

### Dashboard

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/dashboard/overview` | Renewals, rollup, licenses chart, recommendations |

### Users

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/users` | Paginated directory users (`q`, `status`, `sort`) |
| `POST` | `/users` | Create / invite user (Graph) |
| `GET` | `/users/:id` | Detail |
| `PATCH` | `/users/:id` | Block/unblock, profile fields |
| `POST` | `/users/:id/licenses` | Assign/remove licenses |
| `POST` | `/users/sync` | Enqueue Graph sync |

### Subscriptions & products

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/subscriptions` | Purchased products |
| `PATCH` | `/subscriptions/:id/seats` | Change quantity (Partner Center) |
| `POST` | `/subscriptions/:id/cancel` | Cancel / schedule cancel |
| `GET` | `/billing/summary` | Monthly / yearly / triennial totals |

### Catalog & orders

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/catalog/:family` | `microsoft-365` \| `dynamics-365` \| `azure` \| `server-software` |
| `POST` | `/orders` | Create order (add SKUs) |
| `POST` | `/orders/:id/submit` | Submit to Partner Center |
| `GET` | `/orders/:id` | Order status |

### Billing

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/invoices` | Invoice list |
| `GET` | `/invoices/:id` | Detail + PDF URL |

### Security

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/security/summary` | Latest Secure Score snapshot |
| `POST` | `/security/sync` | Refresh from Graph |

### Support

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/support/threads` | Threads for customer |
| `POST` | `/support/threads` | Start chat/ticket |
| `POST` | `/support/threads/:id/messages` | Send message |
| `POST` | `/support/threads/:id/read` | Mark read |

### Integrations hub

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/integrations` | Connected apps for customer |
| `POST` | `/integrations/:provider/connect` | OAuth / API key connect |
| `DELETE` | `/integrations/:provider` | Disconnect |
| `POST` | `/webhooks/:provider` | Inbound webhooks |

### Partner Ops (cross-tenant)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/ops/customers` | List customers |
| `POST` | `/ops/customers` | Onboard customer + tenant |
| `GET` | `/ops/customers/:id/health` | Sync status, alerts |

### Conventions

- All customer routes require `Authorization: Bearer <portal_jwt>`
- Pagination: `?page=1&pageSize=50`
- Errors: RFC7807-style `{ type, title, status, detail, code }`
- Idempotency-Key header on `POST /orders` and seat changes

---

## 7. Microsoft integrations

### A. Entra ID (sign-in)

- SPA / web app registration for the Next.js UI  
- API app registration (audience) for NestJS  
- Validate access tokens on API (issuer, audience, roles)  
- Map `oid` + tenant → `portal_users` + `customers`

### B. Microsoft Graph (per customer tenant)

| Capability | Graph use |
|------------|-----------|
| User sync | `/users`, delta queries |
| Licenses | `/subscribedSkus`, assignLicense |
| Org | `/organization` |
| Secure Score | `/security/secureScores` |
| Threats | Defender / security alerts APIs |

Prefer **Secure Application Model** with certificates in Key Vault. Auth is **per Microsoft API operation** (App+User + GDAP consent where required; partner app credentials where appropriate). Do **not** assume universal “app-only + GDAP” covers all Graph/Partner Center calls.

### C. Partner Center (commerce)

| Capability | Use |
|------------|-----|
| Catalog / offers | Product list & prices |
| Place order | New subscriptions |
| Change seats | Quantity updates |
| Subscriptions | Renewals, status |
| Invoices | Billing history |

**Rule:** Graph does **not** replace Partner Center for selling. Use both.

### Token strategy

| Flow | Who | Purpose |
|------|-----|---------|
| User delegated | Portal admin | Interactive admin actions |
| App-only / GDAP | Worker | Scheduled sync |
| Partner Center app | Worker / API | Orders & billing |

Store secrets in Azure Key Vault / AWS Secrets Manager — never in Postgres plaintext.

---

## 8. External application integrations

This portal should act as an **integration hub**. Design a provider interface:

```ts
interface IntegrationProvider {
  id: string;                 // 'zendesk' | 'stripe' | 'hubspot' | ...
  connect(customerId, config): Promise<void>;
  disconnect(customerId): Promise<void>;
  handleWebhook(payload): Promise<void>;
  healthCheck(customerId): Promise<'ok' | 'error'>;
}
```

### Recommended integration catalog

| Category | Examples | Why |
|----------|----------|-----|
| **Support** | Zendesk, Freshdesk, Microsoft Teams | Replace demo chat |
| **Billing** | Partner Center (primary), Stripe (optional add-ons) | Invoices & payments |
| **CRM** | HubSpot, Dynamics 365 Sales | Customer lifecycle |
| **Monitoring** | Datadog, Azure Monitor, Sentry | API/worker health |
| **Identity extras** | Conditional Access reports | Security module |
| **PSA / tickets** | ConnectWise, Autotask | MSP workflows |
| **Notifications** | SendGrid, Twilio, Teams webhooks | Alerts on renewals / sync fail |
| **Storage** | Azure Blob / S3 | Invoice PDFs, exports |
| **Analytics** | Power BI embedded / Cube | Usage & revenue dashboards |

### Integration rules

1. Credentials stored as `secrets_ref` (vault path), not raw keys in DB.  
2. Every provider has sandbox + production configs.  
3. Webhooks verified (signature) before processing.  
4. Failures go to `sync_runs` / dead-letter queue.  
5. Customer can enable/disable per integration in UI later.

---

## 9. Background jobs & sync

| Job | Schedule | Action |
|-----|----------|--------|
| `users.sync` | Every 15–60 min + on-demand | Graph → `directory_users` |
| `subscriptions.sync` | Hourly + on-demand | Partner Center + Graph seats |
| `catalog.sync` | Daily | Partner Center offers → `catalog_products` |
| `invoices.sync` | Daily | Import invoices |
| `security.sync` | Daily / 6h | Secure Score snapshot |
| `recommendations.refresh` | Daily | Rules → `product_recommendations` |
| `renewals.notify` | Daily | Email/Teams for upcoming renewals |

### On-demand sync API

`POST /users/sync` should:

1. Create `sync_runs` row (`queued`)  
2. Enqueue job  
3. Return `{ runId, status: "queued" }`  
4. UI polls `GET /sync/:runId` or uses WebSocket/SSE  

Never run a full tenant Graph crawl inside the HTTP request timeout.

---

## 10. Security

### Must-haves

| Control | Implementation |
|---------|----------------|
| Authentication | Entra ID + short-lived portal JWT (or opaque session in Redis) |
| Authorization | Role guards per route |
| Tenant isolation | `customer_id` filter + optional Postgres RLS |
| Transport | HTTPS only, HSTS |
| Secrets | Key Vault; rotate client secrets |
| Input validation | Zod / class-validator on all DTOs |
| Rate limiting | Per IP + per customer |
| Audit log | Immutable append for sensitive actions |
| CORS | Allow only `office365.cp.netrichtechnologies.com` |
| Webhooks | Signature verification + idempotency keys |
| Dependency security | `npm audit`, Dependabot / Renovate |

### Roles

| Role | Access |
|------|--------|
| `ReadOnly` | GET dashboards, users, products |
| `CustomerAdmin` | Users, licenses, orders |
| `Billing` | Invoices, payment methods |
| `PartnerOps` | Cross-customer ops console |
| `SupportAgent` | Support threads only |

### Data protection

- Encrypt PII at rest if required by contracts (Postgres TDE / column encryption)  
- Soft-delete customers with retention policy  
- Export / delete APIs for GDPR-style requests  

---

## 11. Performance

| Technique | Use |
|-----------|-----|
| Postgres indexes + pagination | Users/catalog lists |
| Redis cache | Catalog, dashboard overview (TTL 1–5 min) |
| Delta Graph queries | Faster user sync |
| Materialized overview | Precompute rollup counts |
| CDN | Next.js static assets |
| Connection pooling | PgBouncer |
| Horizontal scale | Stateless API replicas; workers scale separately |

Target UX: dashboard overview &lt; 300ms from cache; sync is async.

---

## 12. Environments & config

```env
# API
NODE_ENV=production
PORT=8080
DATABASE_URL=postgres://...
REDIS_URL=redis://...
JWT_SECRET=...
CORS_ORIGINS=https://office365.cp.netrichtechnologies.com

# Entra
AZURE_AD_TENANT_ID=...
AZURE_AD_API_CLIENT_ID=...
AZURE_AD_API_CLIENT_SECRET=...
AZURE_AD_SPA_CLIENT_ID=...

# Partner Center
PARTNER_CENTER_APP_ID=...
PARTNER_CENTER_ACCOUNT_ID=...
PARTNER_CENTER_TENANT_ID=...

# Graph (app-only)
GRAPH_CLIENT_ID=...
GRAPH_CLIENT_SECRET=...

# Integrations (examples)
ZENDESK_SUBDOMAIN=...
ZENDESK_API_TOKEN=...
SENDGRID_API_KEY=...
SENTRY_DSN=...
```

Frontend keeps only `NEXT_PUBLIC_*` (SPA client ID, API base URL). **No Partner Center secrets in the browser.**

---

## 13. Implementation roadmap

### Done — MVP UI (Next.js)
- Hard multi-tenant isolation, Super Admin tenants/users (disable/terminate/delete)
- MFA (TOTP), per-account passwords, audit log, catalog commerce, support queues
- Partner Control Center + customer nav; `/api/csp` BFF; `.data/*.json` + `foundation.json`

### Done — Phase 1 Foundation (`backend/`)
- NestJS API + BullMQ worker stubs
- Prisma schema (customers ≠ microsoft_tenants, GDAP, RBAC, sessions, audit, onboarding, flags, jobs, approvals)
- RLS SQL helpers/policies; docker-compose Postgres/Redis
- Entra token validation + session create; SAM/Key Vault status stubs
- Seed + `migrate:from-data` from `.data`

### Phase 2 — Microsoft Connected
- Live SAM token acquire/refresh with certificates + Key Vault
- Graph delta sync; Partner Center **read-only**
- Throttling, DLQ UI, service health / security expansion

### Phase 3 — Full CSP
- NCE eligibility + order state machine + idempotency
- Quotes, renewals, billing/reconciliation, Azure domain
- Public API, webhooks, full observability

---

## 14. Folder structure (in-repo Phase 1)

```
backend/
  apps/
    api/src/                 # NestJS controllers (auth, customers, gdap, …)
    worker/src/              # BullMQ stub worker
  libs/                      # prisma, entra, sam, rbac, guards
  prisma/                    # schema, migrations, seed, rls*.sql
  scripts/migrate-from-data.ts
  docker-compose.yml
  README.md
```

Target expansion (Phase 2–3): dedicated modules under `apps/api` for Partner Center, billing, Graph sync; Key Vault clients under `libs/microsoft/`.

**ORM:** Prisma + PostgreSQL (already in use).

---

## Decision summary

| Question | Answer |
|----------|--------|
| Do we need Python/Flask? | **No** for the main backend |
| Best stack? | **NestJS + PostgreSQL + Redis** (or ASP.NET Core if team is C#-first) |
| Why not Flask? | Weak defaults for multi-tenant enterprise, jobs, typing, and team alignment with Next.js |
| Database? | **PostgreSQL** — correct choice |
| How do many apps integrate? | Integrations hub module + webhooks + vault-backed secrets |
| How does UI become fully dynamic? | Replace mocks with API calls; sync Microsoft data into Postgres; serve from API |

---

## Related docs

- Product modules: [DOCUMENTATION.md](./DOCUMENTATION.md)
- CSP stages / SAM / GDAP / NCE: [CSP_PRODUCTION_ARCHITECTURE.md](./CSP_PRODUCTION_ARCHITECTURE.md)
- Isolation & Super Admin: [MULTI_TENANT.md](./MULTI_TENANT.md)
- Nest runbook: [../backend/README.md](../backend/README.md)
- Quick start: [../README.md](../README.md)

---

*netrichtechnologies · Backend architecture for the Microsoft 365 Control Panel*
