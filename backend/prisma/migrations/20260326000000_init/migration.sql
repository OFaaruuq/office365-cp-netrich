-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CustomerLifecycle" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATING', 'RETENTION', 'PURGED');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('pending', 'active', 'suspended', 'rejected');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('user', 'worker', 'service_principal', 'integration', 'system');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "GdapStatus" AS ENUM ('draft', 'pending_acceptance', 'active', 'expired', 'terminated', 'error');

-- CreateEnum
CREATE TYPE "OnboardingStepKey" AS ENUM ('customer_created', 'microsoft_tenant_identified', 'csp_relationship', 'gdap_relationship', 'customer_accepted', 'application_consent', 'permissions_verified', 'graph_sync', 'partner_center_sync', 'pricing_configured', 'client_admin_created', 'portal_activated');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'dead_letter');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected', 'expired', 'executed');

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'pending',
    "lifecycle" "CustomerLifecycle" NOT NULL DEFAULT 'ACTIVE',
    "admin_email" TEXT NOT NULL,
    "users_count" INTEGER NOT NULL DEFAULT 0,
    "subscriptions_count" INTEGER NOT NULL DEFAULT 0,
    "monthly_spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "portal_access_enabled" BOOLEAN NOT NULL DEFAULT false,
    "sync_enabled" BOOLEAN NOT NULL DEFAULT false,
    "gdap_enabled" BOOLEAN NOT NULL DEFAULT false,
    "allowed_catalogs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT NOT NULL DEFAULT '',
    "legacy_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "configured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "microsoft_tenants" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "entra_tenant_id" TEXT NOT NULL,
    "displayName" TEXT,
    "default_domain" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "microsoft_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL,
    "microsoft_tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "mx_ok" BOOLEAN,
    "spf_ok" BOOLEAN,
    "dkim_ok" BOOLEAN,
    "dmarc_ok" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_contacts" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "portal_users" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT,
    "customer_id" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "legacy_role" TEXT,
    "entra_oid" TEXT,
    "entra_tid" TEXT,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "break_glass" BOOLEAN NOT NULL DEFAULT false,
    "legacy_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gdap_relationships" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "microsoft_relationship_id" TEXT,
    "displayName" TEXT NOT NULL,
    "status" "GdapStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "duration_days" INTEGER,
    "auto_extend" BOOLEAN NOT NULL DEFAULT false,
    "last_sync_at" TIMESTAMP(3),

    CONSTRAINT "gdap_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gdap_roles" (
    "id" TEXT NOT NULL,
    "relationship_id" TEXT NOT NULL,
    "role_definition_id" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,

    CONSTRAINT "gdap_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gdap_assignments" (
    "id" TEXT NOT NULL,
    "relationship_id" TEXT NOT NULL,
    "partner_security_group_id" TEXT NOT NULL,
    "role_definition_id" TEXT NOT NULL,

    CONSTRAINT "gdap_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gdap_events" (
    "id" TEXT NOT NULL,
    "relationship_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "old_status" TEXT,
    "new_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gdap_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_steps" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "step_key" "OnboardingStepKey" NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "meta" JSONB,

    CONSTRAINT "onboarding_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "actor_type" "ActorType" NOT NULL DEFAULT 'user',
    "actor_user_id" TEXT,
    "actorEmail" TEXT,
    "actor_role" TEXT,
    "actor_tenant" TEXT,
    "target_customer_id" TEXT,
    "target_tenant" TEXT,
    "request_id" TEXT,
    "correlation_id" TEXT,
    "session_id" TEXT,
    "user_agent" TEXT,
    "source_ip" TEXT,
    "operation" TEXT,
    "result" TEXT,
    "risk_level" "RiskLevel" NOT NULL DEFAULT 'low',
    "approval_id" TEXT,
    "microsoft_request_id" TEXT,
    "detail" TEXT,
    "before" JSONB,
    "after" JSONB,
    "meta" JSONB,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_access_sessions" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "read_only" BOOLEAN NOT NULL DEFAULT true,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "admin_access_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privileged_approvals" (
    "id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "customer_id" TEXT,
    "requester_id" TEXT NOT NULL,
    "approver_id" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),

    CONSTRAINT "privileged_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled_global" BOOLEAN NOT NULL DEFAULT false,
    "customer_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "environments" TEXT[] DEFAULT ARRAY['development']::TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "customer_id" TEXT,
    "operation" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "response_code" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_sync_states" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "entra_tenant_id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "delta_link" TEXT,
    "last_full_sync" TIMESTAMP(3),
    "last_delta_sync" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'idle',

    CONSTRAINT "graph_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "customer_id" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_attempts" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT,
    "user_id" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "action_url" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_health" (
    "id" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "detail" TEXT,
    "last_checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,

    CONSTRAINT "integration_health_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "partners_slug_key" ON "partners"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "customers_legacy_id_key" ON "customers"("legacy_id");

-- CreateIndex
CREATE INDEX "customers_partner_id_idx" ON "customers"("partner_id");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE INDEX "customers_lifecycle_idx" ON "customers"("lifecycle");

-- CreateIndex
CREATE INDEX "microsoft_tenants_customer_id_idx" ON "microsoft_tenants"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "microsoft_tenants_customer_id_entra_tenant_id_key" ON "microsoft_tenants"("customer_id", "entra_tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "domains_microsoft_tenant_id_name_key" ON "domains"("microsoft_tenant_id", "name");

-- CreateIndex
CREATE INDEX "customer_contacts_customer_id_idx" ON "customer_contacts"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "portal_users_email_key" ON "portal_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "portal_users_legacy_id_key" ON "portal_users"("legacy_id");

-- CreateIndex
CREATE INDEX "portal_users_customer_id_idx" ON "portal_users"("customer_id");

-- CreateIndex
CREATE INDEX "portal_users_partner_id_idx" ON "portal_users"("partner_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "gdap_relationships_customer_id_idx" ON "gdap_relationships"("customer_id");

-- CreateIndex
CREATE INDEX "gdap_relationships_status_idx" ON "gdap_relationships"("status");

-- CreateIndex
CREATE INDEX "gdap_relationships_expires_at_idx" ON "gdap_relationships"("expires_at");

-- CreateIndex
CREATE INDEX "gdap_roles_relationship_id_idx" ON "gdap_roles"("relationship_id");

-- CreateIndex
CREATE INDEX "gdap_assignments_relationship_id_idx" ON "gdap_assignments"("relationship_id");

-- CreateIndex
CREATE INDEX "gdap_events_relationship_id_idx" ON "gdap_events"("relationship_id");

-- CreateIndex
CREATE INDEX "onboarding_steps_customer_id_idx" ON "onboarding_steps"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_steps_customer_id_step_key_key" ON "onboarding_steps"("customer_id", "step_key");

-- CreateIndex
CREATE INDEX "audit_events_at_idx" ON "audit_events"("at");

-- CreateIndex
CREATE INDEX "audit_events_action_idx" ON "audit_events"("action");

-- CreateIndex
CREATE INDEX "audit_events_target_customer_id_idx" ON "audit_events"("target_customer_id");

-- CreateIndex
CREATE INDEX "admin_access_sessions_actor_user_id_idx" ON "admin_access_sessions"("actor_user_id");

-- CreateIndex
CREATE INDEX "admin_access_sessions_customer_id_idx" ON "admin_access_sessions"("customer_id");

-- CreateIndex
CREATE INDEX "privileged_approvals_status_idx" ON "privileged_approvals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- CreateIndex
CREATE INDEX "idempotency_keys_customer_id_idx" ON "idempotency_keys"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_key_operation_key" ON "idempotency_keys"("key", "operation");

-- CreateIndex
CREATE UNIQUE INDEX "graph_sync_states_customer_id_entra_tenant_id_resource_key" ON "graph_sync_states"("customer_id", "entra_tenant_id", "resource");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_queue_idx" ON "jobs"("queue");

-- CreateIndex
CREATE INDEX "job_attempts_job_id_idx" ON "job_attempts"("job_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_customer_id_idx" ON "notifications"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_health_component_key" ON "integration_health"("component");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "microsoft_tenants" ADD CONSTRAINT "microsoft_tenants_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_microsoft_tenant_id_fkey" FOREIGN KEY ("microsoft_tenant_id") REFERENCES "microsoft_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "portal_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "portal_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gdap_relationships" ADD CONSTRAINT "gdap_relationships_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gdap_roles" ADD CONSTRAINT "gdap_roles_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "gdap_relationships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gdap_assignments" ADD CONSTRAINT "gdap_assignments_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "gdap_relationships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gdap_events" ADD CONSTRAINT "gdap_events_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "gdap_relationships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "portal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_target_customer_id_fkey" FOREIGN KEY ("target_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_access_sessions" ADD CONSTRAINT "admin_access_sessions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "portal_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_access_sessions" ADD CONSTRAINT "admin_access_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_sync_states" ADD CONSTRAINT "graph_sync_states_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_attempts" ADD CONSTRAINT "job_attempts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
