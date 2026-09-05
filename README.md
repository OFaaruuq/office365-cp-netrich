# netrichtechnologies — Microsoft 365 Control Panel

Multi-tenant CSP-style admin portal for **netrichtechnologies**.

**Production domain:** `https://office365.cp.netrichtechnologies.com`

## Documentation

| Document | Description |
|----------|-------------|
| **[Full System Documentation](./docs/DOCUMENTATION.md)** | Frontend modules, features, APIs, demo vs production |
| **[Backend Documentation](./docs/BACKEND.md)** | Multi-tenant architecture, PostgreSQL, NestJS recommendation, integrations hub |
| **[Multi-tenant & Live Support](./docs/MULTI_TENANT.md)** | Super Admin creates/approves clients; Technical/Billing live chat |
| **This README** | Quick start and high-level overview |

## Features (summary)

| Area | Description |
|------|-------------|
| **Sign-in** | Microsoft 365 admin sign-in (MSAL-ready; demo mode available) |
| **Dashboard** | Renewal calendar, user rollup, purchased licenses, help, recommendations |
| **My Products** | Subscriptions, license usage, billing summary |
| **My Users** | Directory search/sort + **User Sync** (Graph-ready) |
| **Product Catalogs** | Microsoft 365, Dynamics 365, Server Software, Microsoft Azure |
| **Solution Paths** | Collaboration, Email & Data, Security Report |
| **Live Chat** | Support chat with unread banners and agent sessions |
| **APIs** | `/api/users`, `/api/users/sync`, `/api/products`, `/api/subscriptions`, `/api/chat` |

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → **Sign in with Microsoft** (demo mode enters the portal immediately).

## Environment

See [`.env.example`](./.env.example) and the [Configuration section](./docs/DOCUMENTATION.md#8-configuration--environment) in the full docs.

Minimal local vars:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_DOMAIN=office365.cp.netrichtechnologies.com
NEXT_PUBLIC_AZURE_AD_CLIENT_ID=
NEXT_PUBLIC_AZURE_AD_AUTHORITY=https://login.microsoftonline.com/common
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Run production server |
| `npm run lint` | ESLint |

## Brand

Portal branding uses **netrichtechnologies** with the subtitle **Microsoft 365 Control Panel**.

For architecture, module details, API reference, and production roadmap, see **[docs/DOCUMENTATION.md](./docs/DOCUMENTATION.md)**.

For multi-tenant backend, PostgreSQL schema, Microsoft/Partner Center integration, and stack choice (NestJS vs Flask), see **[docs/BACKEND.md](./docs/BACKEND.md)**.
