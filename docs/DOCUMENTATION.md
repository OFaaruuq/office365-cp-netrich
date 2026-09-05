# netrichtechnologies — Microsoft 365 Control Panel

**Full System Documentation**

| | |
|---|---|
| **Product** | netrichtechnologies Microsoft 365 Control Panel |
| **Package** | `netrich-office365-cp` |
| **Version** | 0.1.0 |
| **Production domain** | `https://office365.cp.netrichtechnologies.com` |
| **Stack** | Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · MSAL · Microsoft Graph |
| **Status** | UI-complete demo portal with Graph/MSAL scaffolding for production |

---

## Table of contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Getting started](#3-getting-started)
4. [Modules & features](#4-modules--features)
5. [API reference](#5-api-reference)
6. [Data models](#6-data-models)
7. [Integrations](#7-integrations)
8. [Configuration & environment](#8-configuration--environment)
9. [UI / UX system](#9-ui--ux-system)
10. [Security notes](#10-security-notes)
11. [Demo vs production](#11-demo-vs-production)
12. [Roadmap](#12-roadmap)
13. [File map](#13-file-map)

---

## 1. Overview

### Purpose

The **netrichtechnologies Microsoft 365 Control Panel** is a multi-tenant CSP-style portal where clients of netrichtechnologies can:

- View Microsoft 365 overview (renewals, users, licenses)
- Manage purchased subscriptions and license usage
- Browse and add Microsoft product catalogs (M365, Dynamics 365, Azure, Server Software)
- Sync and manage directory users from Microsoft 365 Admin / Entra ID
- Follow solution paths (Collaboration, Email & Data, Security)
- Contact support via live chat

### Branding

| Element | Value |
|---------|--------|
| Company wordmark | **netrichtechnologies** |
| Product subtitle | **Microsoft 365 Control Panel** |
| Primary domain | `office365.cp.netrichtechnologies.com` |
| Admin (demo) | `admin@netrichtechnologies.com` |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (SPA / App Router)               │
│  Sign-in → Portal Shell (Header + Sidebar + Footer + Chat)  │
└─────────────┬───────────────────────────────┬───────────────┘
              │                               │
              ▼                               ▼
     Next.js App Routes              Next.js API Routes
     /dashboard /products            /api/users
     /users /catalog/*               /api/users/sync
     /solutions/*                    /api/products
                                     /api/subscriptions
                                     /api/chat
              │                               │
              │                    ┌──────────┴──────────┐
              │                    ▼                     ▼
              │            Microsoft Graph         Demo / Mock
              │            (Bearer token)          (local data)
              │
              ▼
     MSAL (Entra ID) — provider ready; UI sign-in currently demo
```

### Layers

| Layer | Responsibility |
|-------|----------------|
| **App Router pages** | Screens and layouts |
| **Components** | Reusable UI (dashboard widgets, tables, catalog, chat) |
| **lib/** | Types, mock data, Graph helpers, MSAL config |
| **API routes** | REST endpoints for users, products, subscriptions, chat |
| **Design system** | CSS tokens in `globals.css` (colors, radius, buttons, cards) |

---

## 3. Getting started

### Prerequisites

- Node.js 20+
- npm
- (Production) Microsoft Entra ID app registration
- (Production CSP) Microsoft Partner Center enrollment

### Install & run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Script | Command |
|--------|---------|
| Development | `npm run dev` |
| Production build | `npm run build` |
| Start production | `npm start` |
| Lint | `npm run lint` |

### Demo sign-in

On the landing page, **Sign in with Microsoft** currently enters the portal in **demo mode** (no Entra redirect). Portal routes are reachable without a real session until middleware is added.

---

## 4. Modules & features

### 4.1 Authentication & landing

| Item | Detail |
|------|--------|
| **Route** | `/` |
| **Files** | `src/app/page.tsx`, `src/components/auth/AuthProvider.tsx`, `src/lib/msal-config.ts` |
| **Features** | Brand hero, Sign in with Microsoft button, Explore Plans, domain badge, footer terms |
| **MSAL** | `AuthProvider` initializes `PublicClientApplication` and wraps the app in `MsalProvider` |
| **Current behavior** | Button delays ~600ms then navigates to `/dashboard` (demo) |
| **Production gap** | Wire `loginPopup` / `loginRedirect`, show signed-in account, MSAL logout, protect routes |

---

### 4.2 Portal shell

| Item | Detail |
|------|--------|
| **Layout** | `src/app/(portal)/layout.tsx` |
| **Providers** | `ChatProvider`, `NavProvider` |
| **Chrome** | Header (60px) · Sidebar (228px desktop / drawer mobile) · Main · Footer · Chat FAB |

#### Header (`Header.tsx` + `BrandLogo.tsx`)

- Wordmark: **netrichtechnologies** / **Microsoft 365 Control Panel**
- Purple → red accent bar
- Notifications (badge from chat unread count)
- Support dropdown: phone numbers, Live Chat, How-to Articles, Support Tickets, Take a Tour
- Profile menu: demo admin email, Sign out → `/`
- Mobile hamburger (opens sidebar drawer)

#### Sidebar (`Sidebar.tsx` + `NavProvider.tsx`)

| Section | Links |
|---------|--------|
| Workspace | Dashboard, My Products, My Users |
| Product Catalogs | Microsoft 365, Dynamics 365, Server Software, Microsoft Azure |
| Solution Paths | Collaboration Tools, Email And Data, Security Report |
| More… | Billing History, Invoices, Account Settings *(stubs → dashboard)* |

#### Footer (`PortalFooter.tsx`)

- `© {year} netrichtechnologies`
- Website Terms · Privacy Statement · Microsoft 365 Terms

---

### 4.3 Dashboard — Microsoft 365 Overview

| Item | Detail |
|------|--------|
| **Route** | `/dashboard` |
| **Page** | `src/app/(portal)/dashboard/page.tsx` |

| Widget | Component | Features |
|--------|-----------|----------|
| **Renewal Calendar** | `RenewalCalendar.tsx` | Month grid, highlighted renewal dates, product list (date / product / commit / billing / seats), Local Time Zone toggle, View All, My Products |
| **User Rollup** | `UserRollup.tsx` | Active, Pending, Blocked, Error counts with status icons; View All → `/users` |
| **Purchased Licenses** | `PurchasedLicenses.tsx` | Donut chart of seat distribution, license legend (M3 icons), Download Report *(UI only)* |
| **Help & Resources** | `HelpResources.tsx` | Getting Started, Trainings, Support (opens Live Chat) |
| **Product Recommendations** | `ProductRecommendations.tsx` | Suggested SKUs, Add Subscriptions, View All |

**Data source today:** `src/lib/mock-data.ts` (`renewals`, `userRollup`, `recommendations`, `subscriptions`).

---

### 4.4 My Products

| Item | Detail |
|------|--------|
| **Route** | `/products` |
| **Files** | `products/page.tsx`, `ProductCard.tsx` |

**Features**

- Cost summary tiles: Monthly / Yearly / Triennially
- Business section + **+ Add New Business Product**
- Per-subscription cards:
  - Name, description, alert indicator
  - License overview progress (% used)
  - Purchased / Used / Available
  - Billing cycle, Annual Commitment, Next Renewal, Sub Total
  - **Manage Subscriptions** → catalog

**Demo subscriptions:** Microsoft 365 Business Basic (no Teams) · Business Standard (no Teams).

---

### 4.5 My Users

| Item | Detail |
|------|--------|
| **Route** | `/users` |
| **Files** | `users/page.tsx`, `UsersTable.tsx` |

**Features**

- Total user count headline
- **Add User** (UI button; not wired)
- **User Sync** → `POST /api/users/sync`
- Search by name or email
- Sortable columns: Access, User, Licenses
- Status icons: active / pending / blocked / error
- **Manage** per row (UI only)

**Sync behavior**

| Condition | Result |
|-----------|--------|
| `Authorization: Bearer <Graph token>` + client ID configured | Live Graph directory sync |
| No token (current UI) | Demo sync; refreshes mock users with timestamps |

---

### 4.6 Product catalogs

Shared UI: `ProductCatalog.tsx`

**Common features:** search, filter chips, sort (name/price), billing period toggle, expandable details, Add / Manage Subscriptions, purchased vs available status.

| Route | Catalog | Filters (examples) | Billing modes | Attach pricing |
|-------|---------|----------------------|---------------|----------------|
| `/catalog/microsoft-365` | Microsoft 365 | Suites, Security, Teams, Power Platform, All… | Monthly / Annual / Triennial | No |
| `/catalog/dynamics-365` | Dynamics 365 | CRM, ERP, Power Platform, All… | Monthly / Annual | Yes (base + attach) |
| `/catalog/azure` | Microsoft Azure | All Azure Products | Monthly / Annual | No |
| `/catalog/server-software` | Server Software | All Server Software | Annual / Triennial | No |

**M365 only:** “Recommended for you” banner.

**Production gap:** Partner Center catalog + cart/checkout not implemented; Add Subscriptions is non-transactional.

---

### 4.7 Solution paths

| Route | Module | Features |
|-------|--------|----------|
| `/solutions/collaboration` | Collaboration Tools | Teams, SharePoint, Stream cards → browse catalog |
| `/solutions/email-data` | Email And Data | Exchange, OneDrive, SharePoint & Lists |
| `/solutions/security` | Security Report | Sample Identity Health, Threat Protection, Secure Score; CTA to security products |

Security metrics are **hard-coded samples**. Production should use Microsoft Graph Security / Secure Score APIs.

---

### 4.8 Live chat / support

| Item | Detail |
|------|--------|
| **Files** | `ChatProvider.tsx`, `ChatWidget.tsx`, `api/chat/route.ts` |
| **Persistence** | `localStorage` key `nt-support-chat-v2` |

**Features**

- Floating FAB (blue) + unread badge
- Red banner: “You have got N new messages” or “Chatting with {agent}”
- Session states: `idle` → `queued` → `active` → `ended`
- Agents (demo): Sara, Omar, Priya, Alex, Lina
- Message bubbles, typing indicator, emoji insert, file name share
- Support menu **Live Chat** and **O365 Get Help** open the widget
- Keyword-aware replies via `/api/chat` (licenses, users, renewals, Azure/Dynamics, MFA, greetings)

**Production gap:** Replace with Zendesk, Intercom, Teams, or a custom agent queue.

---

## 5. API reference

Base URL (local): `http://localhost:3000`

### `GET /api/users`

Returns mock directory users.

```json
{
  "users": [ /* PortalUser[] */ ],
  "count": 8,
  "source": "local"
}
```

### `POST /api/users/sync`

Syncs users from Microsoft Graph or returns demo data.

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | For live sync | `Bearer <graph-access-token>` |

**Live response:** `{ users, count, source: "graph", syncedAt }`  
**Demo response:** `{ users, count, source: "demo", syncedAt, message }`

### `GET /api/products`

| Query | Result |
|-------|--------|
| *(none)* | Catalog size summary |
| `?catalog=purchased` | Subscriptions + cost summary |
| `?catalog=microsoft-365` | M365 catalog products |
| `?catalog=dynamics-365` | Dynamics catalog |
| `?catalog=azure` | Azure catalog |
| `?catalog=server-software` | Server software catalog |

> Note: Most pages import mock data directly; this API is available for clients/integrations.

### `GET /api/subscriptions`

| Auth | Result |
|------|--------|
| Bearer token | Graph `subscribedSkus` mapped to partial subscriptions |
| None | Local mock subscriptions |

### `POST /api/chat`

```json
{ "message": "I need more licenses", "agentName": "Sara" }
```

```json
{ "reply": "...", "agentName": "Sara", "createdAt": "..." }
```

---

## 6. Data models

Defined in `src/lib/types.ts`.

| Type | Purpose |
|------|---------|
| `PortalUser` | Directory user (id, name, email, status, licenses, sync flags) |
| `UserStatus` | `active` \| `pending` \| `blocked` \| `error` |
| `Subscription` | Purchased SKU (seats, billing, renewal, price, optional alert) |
| `CatalogProduct` | Sellable catalog row (pricing, filters, status) |
| `RenewalItem` | Upcoming renewal for calendar |
| `UserRollup` | Aggregated user status counts |
| `CostSummary` | Monthly / yearly / triennial totals |
| `ProductRecommendation` | Upsell recommendation card |

Demo seed data lives in `src/lib/mock-data.ts`.

---

## 7. Integrations

### 7.1 Microsoft Entra ID (MSAL)

| Config | Location |
|--------|----------|
| Client ID / authority / redirect | `src/lib/msal-config.ts` + env |
| Provider | `src/components/auth/AuthProvider.tsx` |

**Configured scopes (login request):**

- `User.Read`
- `User.Read.All`
- `Directory.Read.All`
- `Organization.Read.All`
- `Directory.AccessAsUser.All`

**Recommended for license assignment (add when implementing):**

- `LicenseAssignment.ReadWrite.All`

### 7.2 Microsoft Graph

| Helper | File | Endpoints used |
|--------|------|----------------|
| `syncUsersFromGraph` | `src/lib/graph.ts` | `/users` (paged), `/subscribedSkus` |
| `syncSubscriptionsFromGraph` | same | `/subscribedSkus` |
| `getMe` | same | `/me` *(ready, unused by UI)* |

SKU part numbers are mapped to friendly names (Business Basic/Standard/Premium, E3/E5, Exchange, EMS, etc.).

### 7.3 Partner Center (planned)

Env placeholders exist for CSP commerce:

- `PARTNER_CENTER_APP_ID`
- `PARTNER_CENTER_ACCOUNT_ID`
- `AZURE_AD_CLIENT_SECRET`
- `AZURE_AD_TENANT_ID`

**Not implemented in application code yet.**

---

## 8. Configuration & environment

Copy `.env.example` → `.env.local`.

| Variable | Required | Used by | Purpose |
|----------|----------|---------|---------|
| `NEXT_PUBLIC_APP_URL` | Yes | Metadata, MSAL redirect fallback | App base URL |
| `NEXT_PUBLIC_APP_DOMAIN` | Docs | — | Production hostname |
| `NEXT_PUBLIC_AZURE_AD_CLIENT_ID` | For real auth/sync | MSAL, `/api/users/sync` | Entra app client ID |
| `NEXT_PUBLIC_AZURE_AD_AUTHORITY` | Recommended | MSAL | e.g. `https://login.microsoftonline.com/common` or tenant ID |
| `AZURE_AD_CLIENT_SECRET` | Production CSP | Planned | App-only / Partner Center |
| `AZURE_AD_TENANT_ID` | Production CSP | Planned | Partner tenant |
| `PARTNER_CENTER_APP_ID` | Production CSP | Planned | Partner Center app |
| `PARTNER_CENTER_ACCOUNT_ID` | Production CSP | Planned | Partner account |

### Deploy

1. Point DNS `office365.cp.netrichtechnologies.com` to your host (Vercel, Azure App Service, etc.).
2. Set production env vars.
3. Register Entra redirect URI for the production URL.
4. `npm run build && npm start` (or platform deploy).

---

## 9. UI / UX system

| Token area | Source |
|------------|--------|
| Colors, radius, shadows | `src/app/globals.css` (`--nt-*`) |
| Font | Plus Jakarta Sans (`next/font`) |
| Components | `.nt-card`, `.nt-btn-primary`, `.nt-btn-secondary`, `.nt-btn-outline`, `.nt-link`, `.nt-input`, `.nt-page-title` |
| Layout | Portal canvas gradient, responsive sidebar drawer &lt; 1024px |

**Primary brand purple:** `#5c2d91`  
**Accent header gradient:** purple → magenta → red  
**Chat FAB:** Microsoft blue `#0078d4`

---

## 10. Security notes

| Topic | Current state | Recommendation |
|-------|---------------|----------------|
| Route protection | None | Add Next.js middleware; require MSAL session for `(portal)` |
| Secrets | Client ID is public (`NEXT_PUBLIC_*`); secrets must stay server-only | Never expose `AZURE_AD_CLIENT_SECRET` to the browser |
| Graph tokens | Should be acquired via MSAL and sent only to your APIs / Graph | Prefer server-side token exchange for Partner Center |
| Chat persistence | Browser `localStorage` | Do not store secrets; clear on logout |
| Demo admin email | Hard-coded mock | Replace with Graph `/me` profile |

---

## 11. Demo vs production

| Module | Demo today | Production target |
|--------|------------|-------------------|
| Sign-in | Instant redirect | MSAL login / logout + session |
| Dashboard | Mock renewals, rollup, licenses | Live Graph + billing renewals |
| Products | Mock subscriptions | Graph SKUs + Partner Center |
| Users | Mock list + demo sync | Graph sync with MSAL token; CRUD licenses |
| Catalogs | Static SKUs/prices | Partner Center catalog & orders |
| Solutions / Security | Static cards / sample scores | Secure Score & Defender APIs |
| Chat | Keyword bot | Real support platform |
| Multi-tenant CSP | Concept only | Customer tenant mapping & isolation |
| Billing History / Invoices | Stub links | Partner Center / finance APIs |

---

## 12. Roadmap

Suggested implementation order:

1. **Auth** — MSAL sign-in/out, session gate, display real admin identity  
2. **User Sync** — acquire Graph token in UI → `POST /api/users/sync` with Bearer  
3. **Subscriptions** — load `subscribedSkus` into Products / Purchased Licenses  
4. **Partner Center** — catalog, seat changes, renewals, invoices  
5. **Security Report** — Secure Score + threat metrics from Graph  
6. **Support** — production chat / ticketing  
7. **Multi-tenant** — per-customer tenant context for CSP customers  

---

## 13. File map

```
src/
  app/
    layout.tsx                 # Root layout + font + AuthProvider
    page.tsx                   # Sign-in landing
    globals.css                # Design tokens
    (portal)/
      layout.tsx               # Portal shell
      dashboard/page.tsx
      products/page.tsx
      users/page.tsx
      catalog/
        microsoft-365/page.tsx
        dynamics-365/page.tsx
        azure/page.tsx
        server-software/page.tsx
      solutions/
        collaboration/page.tsx
        email-data/page.tsx
        security/page.tsx
    api/
      users/route.ts
      users/sync/route.ts
      products/route.ts
      subscriptions/route.ts
      chat/route.ts
  components/
    auth/AuthProvider.tsx
    chat/ChatProvider.tsx
    layout/
      Header.tsx
      Sidebar.tsx
      BrandLogo.tsx
      NavProvider.tsx
      ChatWidget.tsx
      PortalFooter.tsx
    dashboard/
      RenewalCalendar.tsx
      UserRollup.tsx
      PurchasedLicenses.tsx
      HelpResources.tsx
      ProductRecommendations.tsx
    products/ProductCard.tsx
    users/UsersTable.tsx
    catalog/ProductCatalog.tsx
  lib/
    types.ts
    mock-data.ts
    graph.ts
    msal-config.ts
```

---

## Document control

| | |
|---|---|
| **Product** | netrichtechnologies Microsoft 365 Control Panel |
| **Document** | Full system documentation |
| **Audience** | Engineers, CSP admins, stakeholders |
| **Related** | [README.md](../README.md) (quick start) · [BACKEND.md](./BACKEND.md) (multi-tenant API, PostgreSQL, integrations) · `.env.example` |

*Generated from a full codebase audit of all modules and features.*
