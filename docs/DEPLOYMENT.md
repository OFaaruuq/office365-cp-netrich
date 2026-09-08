# Production deployment

**Target:** `https://office365.cp.netrichtechnologies.com`

## Quick start (recommended — Docker)

```powershell
# 1) Create env
copy .env.production.example .env.production

# 2) Generate session secret and paste into .env.production
npm run deploy:secret

# 3) Edit .env.production — set:
#    PORTAL_SESSION_SECRET=...
#    NEXT_PUBLIC_AZURE_AD_CLIENT_ID=...
#    NEXT_PUBLIC_APP_URL=https://office365.cp.netrichtechnologies.com

# 4) Validate
npm run deploy:check

# 5) Build & run UI container
npm run deploy:docker

# Optional: also start Nest API + Postgres + Redis
npm run deploy:docker:backend
```

Linux:

```bash
cp .env.production.example .env.production
npm run deploy:secret   # paste into .env.production
npm run deploy:check
chmod +x scripts/deploy-production.sh
./scripts/deploy-production.sh --docker
```

Put a reverse proxy (Nginx / IIS / Azure Front Door / Cloudflare) in front of port `3000` with TLS for `office365.cp.netrichtechnologies.com`.

## Without Docker (Node on host)

```powershell
npm run deploy:check
npm run deploy:start
```

This runs `npm ci` → `next build` → `next start` with `NODE_ENV=production`.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run deploy:secret` | Generate `PORTAL_SESSION_SECRET` |
| `npm run deploy:check` | Validate `.env.production` |
| `npm run deploy:build` | Install + production build |
| `npm run deploy:start` | Build + `next start` |
| `npm run deploy:docker` | Docker Compose UI |
| `npm run deploy:docker:backend` | Docker UI + Nest/Postgres/Redis |
| `npm run deploy:prod` | Alias: check + docker |

PowerShell wrapper: `.\scripts\deploy-production.ps1 -Docker`

## Production checklist

1. `PORTAL_SESSION_SECRET` ≥ 32 chars (required — app refuses to boot without it)
2. `ALLOW_DEMO_LOGIN=false` (Entra SSO is the production path)
3. Entra app registration redirect URI includes `https://office365.cp.netrichtechnologies.com`
4. Persist `.data` volume (quotes, invoices, purchase orders, MFA secrets)
5. Backups for `.data` and Postgres (if `--with-backend`)
6. TLS termination at the reverse proxy / load balancer

## Files

- `scripts/deploy-production.mjs` — main deploy script
- `scripts/deploy-production.ps1` — Windows wrapper
- `scripts/deploy-production.sh` — Linux wrapper
- `Dockerfile` — Next.js standalone image
- `docker-compose.prod.yml` — production compose
- `.env.production.example` — env template
