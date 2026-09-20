# Multi-tenant & Super Admin

## Policy

**Only netrichtechnologies Super Admin** (`partner_admin` / Platform Super Admin pack) can:

- Create client tenants  
- Configure GDAP, sync, catalogs, contacts  
- Approve / reject / **disable (suspend)** / **terminate** tenants  
- Enable client portal access  
- Create, edit, disable, or **delete** Client Admins and portal staff  
- Set / clear **passwords** and **reset MFA** for any account  
- Manage catalog products & pricing  
- **View-as-customer** (reason + duration + read-only default; audited)

**Clients cannot** create or approve their own tenants. Portal login works only when status is `active` and `portalAccessEnabled` is true.

**Tenant delete** defaults to soft **TERMINATING** lifecycle (portal locked, records retained). Hard purge requires `force=true`. Production uses `ACTIVE → SUSPENDED → TERMINATING → RETENTION → PURGED`.

Super Admin cannot disable/delete **their own** account, or delete the **last** active Partner Super Admin.

## Production path

See [CSP_PRODUCTION_ARCHITECTURE.md](./CSP_PRODUCTION_ARCHITECTURE.md): NestJS + PostgreSQL/RLS + Entra SSO + Secure Application Model. Password + TOTP is **break-glass only** — not primary MFA for Microsoft customer admins.

## Flow

```
Super Admin creates tenant (status: pending, portal locked)
        ↓
12-step onboarding (tenant, CSP, GDAP, consent, sync, pricing, admin, activate)
        ↓
Super Admin Approves → status: active, portal unlocked
        ↓
Client Admin signs in (Entra; break-glass only if allow-listed)
        ↓
Optional: Disable (suspend) · Terminate (retention) · View-as-customer
```

## Roles

| Role | Access |
|------|--------|
| Super Admin (`partner_admin`) | Partner Control Center: tenants, onboarding, GDAP, users, catalog, health, audit |
| Technical / Billing Support | `/support` live chat (**own team queue only**) |
| Client Admin (`customer_admin`) | Workspace only — users, products, catalogs, support |

Fine-grained RBAC packs live in `backend/libs/rbac.ts` (and `/api/csp/rbac/*`).

## Hard tenant isolation

| Control | Behavior |
|---------|----------|
| Signed httpOnly cookie | `nt_portal_session` — role + `customerId` server-bound |
| MFA | Entra Conditional Access for production; TOTP for break-glass |
| Portal lock re-check | Suspend/terminate clears access on next API call |
| `resolveTenantScope` | Clients forced to session tenant; partners pass `?customerId=` |
| PostgreSQL RLS | Mandatory in Nest/Postgres (`SET LOCAL app.customer_id`) |
| Audit | Compliance fields + `/api/admin/audit` / `/api/csp/audit` |
| Rate limit | Login attempts limited per IP |

Cross-tenant API calls return **`403`** with `TENANT_ISOLATION` / `PORTAL_LOCKED` / `TEAM_ISOLATION` / `SUPER_ADMIN_REQUIRED`.

Set **`PORTAL_SESSION_SECRET`** (≥32 chars) in production. Everyday sign-in is Microsoft Entra ID. Password + TOTP is break-glass only.

## Try it

1. Super Admin → **Tenants** / **Onboarding** / **GDAP**  
2. **Users & MFA** → password / MFA reset  
3. Tenant detail → **View as customer** (reason required)  
4. **Disable** or **Terminate** a tenant (soft TERMINATING; portal locked)  
5. With native Postgres/Redis: `cd backend && npx prisma migrate deploy && npm run prisma:seed && npm run migrate:from-data && npm run dev:api`

See [DOCUMENTATION.md](./DOCUMENTATION.md), [CSP_PRODUCTION_ARCHITECTURE.md](./CSP_PRODUCTION_ARCHITECTURE.md), and [backend/README.md](../backend/README.md).
