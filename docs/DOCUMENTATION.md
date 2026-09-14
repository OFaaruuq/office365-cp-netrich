# netrichtechnologies — Microsoft 365 Control Panel

**Full System Documentation**

| | |
|---|---|
| **Product** | netrichtechnologies Microsoft 365 Control Panel |
| **Package** | `netrich-office365-cp` |
| **Version** | 0.1.0 |
| **Production domain** | `https://office365.cp.netrichtechnologies.com` |
| **UI** | Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · MSAL |
| **API** | NestJS Foundation (`backend/`, `:8080`) + Next Route Handlers |
| **Persistence** | `.data/*.json` (MVP) · PostgreSQL + Prisma (Foundation) |
| **Status** | Phase 1 Foundation complete in-repo; Microsoft Connected / Full CSP planned |

---

## Table of contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Getting started](#3-getting-started)
4. [Roles & access](#4-roles--access)
5. [Modules & features](#5-modules--features)
6. [API reference](#6-api-reference)
7. [Data stores](#7-data-stores)
8. [Integrations](#8-integrations)
9. [Configuration & environment](#9-configuration--environment)
10. [UI / UX system](#10-ui--ux-system)
11. [Security](#11-security)
12. [Production identity](#12-production-identity)
13. [Roadmap](#13-roadmap)
14. [File map](#14-file-map)

---

## 1. Overview

### Purpose

Multi-tenant CSP-style portal where:

- **Partner Super Admin** operates the Partner Control Center (customers, GDAP, onboarding, catalog, users, audit)
- **Client Admins** manage only their tenant workspace
- **Support** agents handle Technical or Billing queues

### Branding

| Element | Value |
|---------|--------|
| Wordmark | **netrichtechnologies** |
| Subtitle | **Microsoft 365 Control Panel** |
| Domain | `office365.cp.netrichtechnologies.com` |
| Bootstrap Super Admin | `admin@netrichtechnologies.com` |

### Related docs

| Document | Focus |
|----------|--------|
| [README.md](../README.md) | Quick start |
| [CSP_PRODUCTION_ARCHITECTURE.md](./CSP_PRODUCTION_ARCHITECTURE.md) | SAM, GDAP, NCE, maturity stages |
| [MULTI_TENANT.md](./MULTI_TENANT.md) | Isolation & terminate lifecycle |
| [BACKEND.md](./BACKEND.md) | NestJS / Postgres design |
| [backend/README.md](../backend/README.md) | API runbook |

---

## 2. Architecture

```
Browser
  ├─ Entra SSO (production)  OR  break-glass password → TOTP
  └─ Portal shell (Header · Partner Control Center / Workspace sidebar · Chat)
           │
           ▼
    Next.js (:3000) ── BFF /api/* + /api/csp/*
           │                    │
           │                    ▼ (if up)
           │            NestJS API (:8080) /v1/*
           │                    │
           ▼                    ▼
     .data/*.json         PostgreSQL + RLS
     foundation.json      Redis / BullMQ worker
```

| Layer | Responsibility |
|-------|----------------|
| **Middleware** | Session cookie; `/admin` & `/api/admin` = partner only |
| **Next pages** | Partner Control Center + client workspace |
| **Next APIs** | Auth/MFA, admin CRUD, workspace, commerce, support; CSP BFF |
| **Nest API** | Customers, GDAP, onboarding, RBAC, SAM health, audit, approvals, Entra sessions |
| **Design system** | `globals.css` `--nt-*` tokens |

---

## 3. Getting started

### Prerequisites

- Node.js 20+
- npm
- Microsoft Authenticator / Entra MFA (password + TOTP only for break-glass)
- Docker Desktop for Nest/Postgres (optional for UI-only)

### UI

```bash
npm install
cp .env.example .env.local
npm run dev
```

### Backend

```bash
cd backend
cp .env.example .env
npm install && npm run docker:up
npx prisma migrate deploy && npm run prisma:seed
npm run migrate:from-data
npm run dev:api
```

| Script (root) | Command |
|---------------|---------|
| Development | `npm run dev` |
| Build | `npm run build` |
| Start | `npm start` |
| Lint | `npm run lint` |

### Production sign-in

1. **Sign in with Microsoft** (Entra ID + Conditional Access MFA).
2. Super Admin must provision the portal account first.
3. **Emergency access** (break-glass allow-list) uses a unique password + TOTP — not a shared secret.

---

## 4. Roles & access

| Role | Code | Access |
|------|------|--------|
| Partner Super Admin | `partner_admin` | Full Partner Control Center |
| Client Admin | `customer_admin` | Own tenant workspace only |
| Technical Support | `support_technical` | Technical support queue |
| Billing Support | `support_billing` | Billing support queue |

Fine-grained packs (Platform Super Admin, Operations, Billing, Customer Global Admin, …) live in `backend/libs/rbac.ts` and `/api/csp/rbac/*`.

**Super Admin only:** create/configure/approve/suspend/**terminate** tenants; passwords & MFA reset; catalog; view-as-customer; hard purge with `force=true`.

Cannot disable/delete own account or the last active Super Admin.

---

## 5. Modules & features

### 5.1 Authentication (`/`)

Split-screen login · Sign in with Microsoft · Explore Plans (Entra) · Emergency access for break-glass.

### 5.2 Partner Control Center

| Route | Features |
|-------|----------|
| `/admin` | Ops overview |
| `/admin/tenants` | List/create; approve / reject / disable / **terminate** |
| `/admin/tenants/[id]` | Configure, onboarding progress, GDAP panel, Client Admins, view-as |
| `/admin/onboarding` | 12-step board across customers |
| `/admin/gdap` | Relationships, expiry, remaining days, roles |
| `/admin/users` | Create/edit/password/MFA/disable/delete |
| `/admin/catalog` | Product & pricing CRUD |
| `/admin/microsoft/integration` | Platform / SAM health |
| `/admin/security/audit` | Audit trail |
| `/admin/platform/flags` | Feature flags |
| `/admin/commerce/*`, `/admin/billing/*` | Local quotes, orders, invoices (NCE rules; Partner Center writes disabled until configured) |

**Tenant lifecycle:** `pending` → `active` · `suspended` · soft **`TERMINATING`** (default delete) · hard purge with `force=true`.

### 5.3 Client workspace

| Route | Notes |
|-------|--------|
| `/dashboard`, `/products`, `/users` | Live MVP widgets / tables |
| `/catalog/*` | Allowed catalogs only |
| `/solutions/*` | Collaboration, Email & Data, Security |
| `/support` | Chat / inbox by role |
| `/workspace/*` | Domains, groups, licenses, Azure, service health, billing, renewals, org, admins, notifications, audit |

### 5.4 Support

Client FAB chat · `/support` for agents · team isolation on claim.

---

## 6. API reference

Base UI: `http://localhost:3000` · Nest: `http://localhost:8080`

### Auth (Next)

| Method | Path | Description |
|--------|------|-------------|
| `GET/POST/DELETE` | `/api/auth/session` | Session; password step → MFA challenge |
| `POST` | `/api/auth/mfa` | Enroll / verify TOTP → session cookie |

### Super Admin (Next)

| Method | Path | Description |
|--------|------|-------------|
| `GET/POST/PATCH` | `/api/admin/customers` | Tenants; actions include `approve`, `suspend`, `terminate`/`delete` (soft), `force` purge |
| `GET/POST/PATCH` | `/api/admin/users` | Users; `set_password`, `reset_mfa`, `disable`, `delete` |
| `*` | `/api/admin/catalog` | Catalog CRUD |
| `GET` | `/api/admin/audit` | Audit |

### CSP BFF → Nest

| Method | Path | Description |
|--------|------|-------------|
| `*` | `/api/csp/[...path]` | Proxies to Nest `/v1/...` or local `foundation.json` |

Examples: `customers`, `gdap`, `onboarding/...`, `flags`, `microsoft/integration`, `audit`, `admin-access`, `rbac/permissions`, `health`.

### Workspace & commerce (Next)

`/api/me/tenant`, `/api/me/workspace`, `/api/products`, `/api/subscriptions`, `/api/commerce/subscribe`, `/api/users`, `/api/users/sync`, `/api/support/threads`, `/api/chat`

### Nest `/v1` (Foundation)

See [backend/README.md](../backend/README.md) — auth, customers, gdap, onboarding, rbac, flags, microsoft/integration, audit, admin-access, approvals, `/health`.

Isolation errors: `403` with `TENANT_ISOLATION`, `PORTAL_LOCKED`, `TEAM_ISOLATION`, `SUPER_ADMIN_REQUIRED`, `RBAC_DENIED`.

---

## 7. Data stores

### MVP (`.data/`)

| File | Contents |
|------|----------|
| `customers.json` | Tenants + config (+ optional `lifecycle`) |
| `portal-accounts.json` | Account overrides / soft-deleted |
| `mfa-secrets.json` | TOTP |
| `account-passwords.json` | scrypt hashes |
| `catalog-products.json` | Catalog |
| `tenant-subscriptions.json` | Purchases |
| `audit-log.json` | Audit |
| `foundation.json` | GDAP, onboarding, flags, view-as (BFF fallback) |

### Foundation (PostgreSQL via Prisma)

Partners, customers, `microsoft_tenants` (1:N), contacts, GDAP tables, portal users, roles/permissions, sessions, audit_events, onboarding_steps, feature_flags, idempotency_keys, graph_sync_states, jobs, approvals, notifications, …

RLS helpers: `backend/prisma/rls.sql` + `rls-policies.sql`.

---

## 8. Integrations

| Integration | Status |
|-------------|--------|
| **MSAL / Entra** | UI SSO ready; Nest validates access tokens when `AZURE_AD_API_AUDIENCE` set |
| **TOTP MFA** | Break-glass emergency path only — not primary MFA for Microsoft admins |
| **Microsoft Graph** | Token + directory/users/groups/service-health/secureScore when `GRAPH_*` is set; otherwise `GRAPH_NOT_CONFIGURED` (never faked) |
| **Partner Center / SAM** | Token acquire + read-only customers when `PARTNER_CENTER_*` is set; writes stay off unless `PARTNER_CENTER_WRITES_ENABLED=true` |
| **Key Vault** | URI placeholder for certificates / token encryption |

---

## 9. Configuration & environment

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_APP_URL` | App base URL |
| `NEXT_PUBLIC_CSP_API_URL` / `CSP_API_URL` | Nest base (`http://localhost:8080`) |
| `NEXT_PUBLIC_AZURE_AD_CLIENT_ID` | Entra SPA |
| `NEXT_PUBLIC_AZURE_AD_AUTHORITY` | Authority |
| `PORTAL_SESSION_SECRET` | Session HMAC (production required) |
| Backend: `DATABASE_URL`, `REDIS_URL`, `AZURE_AD_API_AUDIENCE`, `AZURE_KEY_VAULT_URI` | See `backend/.env.example` |

---

## 10. UI / UX system

Tokens in `src/app/globals.css` (`--nt-*`). Font: Plus Jakarta Sans. Components: `.nt-card`, `.nt-btn-primary`, `.nt-input`, … Primary purple `#5c2d91`.

---

## 11. Security

| Control | Behavior |
|---------|----------|
| Session | Signed httpOnly `nt_portal_session` |
| Middleware | Portal + API auth; admin = partner |
| Passwords | Unique per-account scrypt. Emergency access is break-glass only. |
| MFA | Entra Conditional Access (primary) / TOTP for break-glass |
| Portal lock | Re-checked on API after suspend/terminate |
| View-as | Reason + duration + banner + audit; read-only default |
| Terminate | Soft retention by default |
| Audit | Append-oriented events; Nest compliance fields |
| Rate limit | Login per IP |

---

## 12. Production identity

| Area | This codebase |
|------|----------------|
| Identity | Microsoft Entra ID + Conditional Access; break-glass password + TOTP for allow-listed emails |
| Data | `.data` + optional Postgres |
| Commerce | Local catalog requests; Super Admin records payment with a reference |
| Graph | Optional; `GRAPH_NOT_CONFIGURED` when unset (never faked) |
| Billing / Azure | Partner Center writes remain off until explicitly enabled |

---

## 13. Roadmap

1. **Foundation (Phase 1 — done in-repo)** — NestJS, Prisma/RLS, Entra path, Graph/PC token clients, GDAP/onboarding, Partner Control Center  
2. **Microsoft Connected (Phase 2)** — Live Graph + Partner Center **read-only** when credentials are set  
3. **Full CSP (Phase 3)** — NCE Partner Center writes, Azure consumption, public API  

Details: [CSP_PRODUCTION_ARCHITECTURE.md](./CSP_PRODUCTION_ARCHITECTURE.md).

---

## 14. File map

```
src/app/
  page.tsx                    Login (Entra; emergency access for break-glass)
  middleware.ts
  (portal)/admin/             Partner Control Center
  (portal)/workspace/         Customer shells
  (portal)/dashboard|products|users|catalog|solutions|support
  api/auth|admin|csp|me|commerce|users|support|…
src/components/  src/lib/     foundation-store, rbac-catalog, auth, stores
backend/
  apps/api  apps/worker  libs/  prisma/  scripts/  docker-compose.yml
.data/                        MVP JSON + foundation.json
docs/                         DOCUMENTATION, CSP_PRODUCTION_ARCHITECTURE, BACKEND, MULTI_TENANT
```

---

## Document control

| | |
|---|---|
| **Audience** | Engineers, CSP admins, stakeholders |
| **Updated** | Phase 1 Foundation alignment |

*Audited against live routes, Nest controllers, and `.data` / Prisma stores.*
