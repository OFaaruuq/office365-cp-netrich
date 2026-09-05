# Multi-tenant & Super Admin

## Policy

**Only netrichtechnologies Super Admin** can:

- Create client tenants  
- Configure GDAP, sync, catalogs, contacts  
- Approve / reject / suspend tenants  
- Enable client portal access  
- Inspect another tenant’s workspace (audited)

**Clients cannot** create or approve their own tenants. Portal login works only when status is `active` and `portalAccessEnabled` is true.

## Flow

```
Super Admin creates tenant (status: pending, portal locked)
        ↓
Super Admin configures (GDAP, sync, catalogs, contacts)
        ↓
Super Admin Approves → status: active, portal unlocked
        ↓
Client Admin can sign in to their control panel
```

## Roles

| Role | Access |
|------|--------|
| Super Admin (`partner_admin`) | `/admin`, `/admin/customers`, approve/configure, audited inspect |
| Technical / Billing Support | `/support` live chat (**own team queue only**) |
| Client Admin | Own tenant workspace only — users, products, security, chats |

## Hard tenant isolation

Each client tenant is a separate security boundary:

| Control | Behavior |
|---------|----------|
| Signed httpOnly cookie | `nt_portal_session` — role + `customerId` server-bound |
| Portal lock re-check | Suspend/reject clears access on next API call (not only at login) |
| Unified `resolveTenantScope` | Clients forced to session tenant; partners must pass `?customerId=` |
| Workspace APIs | `/api/me/workspace`, users, products, subscriptions — never cross tenants |
| `allowedCatalogs` | Per-tenant catalog gate |
| Security Report | Per-tenant MFA / Secure Score (not global mock) |
| Support chats | Client sees own threads only; agents see own team; claim enforces team |
| Graph import | Disabled in demo so one Entra token cannot be labeled as another customer |
| Audit log | `.data/audit-log.json` + `/api/admin/audit` — create/approve/inspect/sync |
| Rate limit | Login attempts limited per IP |
| `/api/chat` | Requires session (no anonymous bot) |

Cross-tenant API calls return **`403`** with `code: TENANT_ISOLATION` (or `PORTAL_LOCKED` / `TEAM_ISOLATION` / `THREAD_OWNERSHIP`).

Set **`PORTAL_SESSION_SECRET`** in production.

## Try it

1. Sign in as **Netrich Super Admin** → Client Tenants → configure/approve  
2. **Inspect isolated workspace** on a tenant → audit trail records `tenant.inspect`  
3. Sign in as **Amtelkom Admin** vs **Orbit Admin** — users, spend, and Secure Score differ  
4. Suspend Amtelkom → Amtelkom’s next API call returns `PORTAL_LOCKED` and session is cleared  
5. Technical Support cannot claim Billing threads (`TEAM_ISOLATION`)  
