# CSP Production Architecture

**netrichtechnologies Microsoft 365 Control Panel** — target architecture for a Microsoft-authoritative CSP / Partner Center platform.

| | |
|---|---|
| **Status** | Phase 1 Foundation **complete** for local/Postgres SoR modules (dual-write to `.data` + Nest when up). Live Graph/Partner Center = Phase 2. |
| **UI** | Next.js (`office365.cp.netrichtechnologies.com`) |
| **API** | NestJS (`api.office365.cp.netrichtechnologies.com`, local `:8080`) |
| **System of record** | PostgreSQL + RLS |
| **Jobs** | Redis + BullMQ workers |
| **Secrets** | Azure Key Vault (certificates, encrypted refresh tokens) |

Related: [BACKEND.md](./BACKEND.md) · [DOCUMENTATION.md](./DOCUMENTATION.md) · [MULTI_TENANT.md](./MULTI_TENANT.md) · [README.md](../README.md)

---

## 1. Topology

```text
Internet → WAF → Next.js UI → NestJS API
                    │              ├── PostgreSQL (SoR + RLS)
                    │              ├── Redis / BullMQ
                    │              └── Workers → Graph / Partner Center / integrations
```

**Maturity stages**

| Stage | Contents | In-repo |
|-------|----------|---------|
| **MVP** | Next.js, `.data` JSON, demo email+TOTP, local commerce, hard isolation | Yes — production UI path |
| **Foundation (Phase 1)** | NestJS, Postgres+RLS, Entra path, SAM stubs, GDAP/onboarding/RBAC, Partner Control Center, price/quotes/renewals, jobs/DLQ, sessions, notifications, security center, approvals, break-glass | Yes — `backend/` + `/api/csp` + platform store |
| **Microsoft Connected (Phase 2)** | Live SAM, GDAP sync, Graph + Partner Center **read-only** | Planned |
| **Full CSP (Phase 3)** | NCE commerce, quotes/orders, billing/recon, Azure domain, public API | Planned |

**Rule:** no Partner Center **write** commerce until Phase 2 read-only sync is solid.

---

## 2. Authentication (production)

Primary identity for Microsoft customer and partner admins:

```text
Browser → Microsoft Entra ID (SSO, MFA, Conditional Access)
       → NestJS validates issuer / audience / tid / oid
       → Map to portal_users + customer
```

- Do **not** use Netrich-managed Google Authenticator as primary MFA for Microsoft admins.
- Demo email + password + TOTP remains **dev-only** (`ALLOW_DEMO_LOGIN`).
- Partner Center App+User APIs require MFA-compliant tokens (enforced for Partner Center).

Session model: `sessions` table, refresh token hash, revoke / sign-out-all, risk handling stubs.

---

## 3. Secure Application Model (SAM)

Microsoft requires CSP partners to use the [Secure Application Model](https://learn.microsoft.com/en-us/partner-center/developer/secure-app-model-framework).

```text
Azure Key Vault
  ├── Partner certificate (prefer over client secrets)
  ├── Token encryption key
  ├── Integration credentials
  └── Webhook secrets

MicrosoftIntegrationModule
  ├── Application identity + certificate
  ├── Token acquire / refresh (encrypted store)
  ├── MFA-compliant App+User flows
  ├── Customer consent
  ├── GDAP
  ├── Microsoft Graph
  └── Partner Center
```

Nothing sensitive in React, Postgres plaintext, logs, or Git.

### Auth strategy correction

Do **not** use a universal “app-only + GDAP for everything” rule. Auth is **per Microsoft API operation**:

- Some Graph / Partner Center operations need **App+User** + consent under GDAP.
- Some partner-level operations use app credentials with certificates.
- Design each sync/order path explicitly.

---

## 4. Customer vs Microsoft tenant

```text
netrich_customer (1)
   └── microsoft_tenants (N)   ← never set customer_id = Entra tenant GUID
   └── contacts, portal users, subscriptions, billing, integrations
```

Lifecycle: `ACTIVE → SUSPENDED → TERMINATING → RETENTION → PURGED` (no immediate hard delete for enterprise data).

---

## 5. GDAP subsystem

Tables: `gdap_relationships`, `gdap_roles`, `gdap_assignments`, `gdap_events`.

UI must show status, Microsoft relationship id, expiry, remaining days, role list, renew/review actions — not only “GDAP configured”.

---

## 6. Onboarding workflow (12 steps)

1. Create customer record  
2. Identify Microsoft tenant  
3. Establish CSP relationship  
4. Establish GDAP relationship  
5. Customer accepts relationship  
6. Application consent  
7. Verify permissions  
8. Initial Graph sync  
9. Initial Partner Center sync  
10. Configure pricing  
11. Create Client Admin  
12. Activate portal  

Show progress on the customer profile (not only Pending/Active).

---

## 7. Isolation (defense in depth)

```text
JWT → TenantContextGuard → RBAC Guard → Repository filter → PostgreSQL RLS → Audit
```

```sql
SET LOCAL app.customer_id = '...';
SET LOCAL app.user_id = '...';
SET LOCAL app.role = '...';
```

RLS is **mandatory** on tenant-scoped tables.

---

## 8. RBAC

Partner packs: Platform Super Admin, Operations, Billing, Support, Security, Read Only, Auditor.  
Customer packs: Global Admin, User Admin, License Admin, Billing Admin, Security Reader, Helpdesk, Read Only.

Permissions are fine-grained (`tenant.read`, `subscription.purchase`, `audit.read`, …). Coarse MVP roles map onto these packs for migration.

Sensitive ops (delete tenant, cancel subscription, GDAP change, large seat cuts) require **approval** (four-eyes) before execution.

---

## 9. Commerce (later phases)

- **PartnerCenterModule**: customers, catalog, SKUs, availabilities, orders, subscriptions, transitions, renewals, invoices, Azure plans, pricing.
- **NCE eligibility engine**: UI only shows Microsoft-allowed actions (168h cancel window, scheduled changes, etc.).
- **Order state machine**: DRAFT → VALIDATING → AWAITING_APPROVAL → SUBMITTING → MICROSOFT_ACCEPTED → PROVISIONING → FULFILLED (or FAILED / PARTIAL / CANCELLED / REQUIRES_ACTION).
- **Idempotency**: central `idempotency_keys` for POST orders / seat changes.
- **Price engine**: price_lists, customer rules, promotions, FX — not only three columns.
- **Quotes** before orders for enterprise sales.
- **Renewal center** and **billing/reconciliation** with margin.

Azure is a **separate domain**, not seat-based SKUs.

---

## 10. Operations

Jobs: `gdap.sync`, `users.delta_sync`, `subscriptions.sync`, `catalog.sync`, `invoices.sync`, `service_health.sync`, `renewals.scan`, `orders.reconcile`, …  
Queues: critical, commerce, microsoft-sync, billing, notifications, analytics, maintenance.  
Dead-letter UI, integration health dashboard, throttling (backoff, Retry-After, per-tenant queues, circuit breaker), Graph delta links in `graph_sync_states`.

---

## 11. Audit & privileged access

Compliance-grade `audit_events`: request_id, correlation_id, session_id, actor_type (`user|worker|service_principal|integration|system`), risk_level, approval_id, microsoft_request_id, before/after.

**View as customer**: reason + duration + banner + audit; default **read-only**.  
Break-glass accounts separate from daily Super Admins.

---

## 12. Navigation targets

**Partner Control Center:** Overview · Customers (All / Onboarding / GDAP) · Commerce · Billing · Microsoft · Security · Support · Platform  

**Customer portal:** Dashboard · Microsoft 365 (Users, Licenses, Groups, Domains, Service Health) · Products · Billing · Security · Support · Account  

---

## 13. Phase sequence (build order)

1. PostgreSQL replace `.data`  
2. NestJS API + workers  
3. Entra production authentication  
4. SAM + Key Vault / certificates  
5. Customer ↔ Microsoft tenant ↔ CSP ↔ GDAP onboarding  
6. Graph sync (org, domains, users, SKUs, licenses)  
7. Partner Center **read-only** sync  
8. NCE eligibility engine  
9. Partner Center transactional writes  
10. Reconciliation, monitoring, open to customers  

---

## 14. Microsoft references

- [Secure Application Model](https://learn.microsoft.com/en-us/partner-center/developer/secure-app-model-framework)  
- [Partner Center authentication](https://learn.microsoft.com/en-us/partner-center/developer/partner-center-authentication)  
- [GDAP + SAM migration](https://learn.microsoft.com/en-us/partner-center/developer/gdap-and-secure-application-model)  
- [Partner Center API get started](https://learn.microsoft.com/en-us/partner-center/developer/get-started)  
- [CSP security best practices](https://learn.microsoft.com/en-us/partner-center/security/csp-security-best-practices)  
- [NCE subscriptions](https://learn.microsoft.com/en-us/partner-center/customers/create-a-new-subscription)  
- [Scheduled changes](https://learn.microsoft.com/en-us/partner-center/developer/create-scheduled-changes)  

---

*Phase 1 Foundation is implemented under `backend/` and the Partner/Customer navigation in Next.js. Live Partner Center writes are Phase 3. Runbooks: [../backend/README.md](../backend/README.md) · [../README.md](../README.md).*
