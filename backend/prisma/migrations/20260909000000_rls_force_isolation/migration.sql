-- Harden RLS: FORCE (table owner cannot bypass), match legacy customer ids,
-- and cover remaining tenant-scoped tables.

CREATE OR REPLACE FUNCTION app_current_customer_id() RETURNS text AS $$
  SELECT nullif(current_setting('app.customer_id', true), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS text AS $$
  SELECT nullif(current_setting('app.user_id', true), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_current_role() RETURNS text AS $$
  SELECT coalesce(nullif(current_setting('app.role', true), ''), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_is_partner_admin() RETURNS boolean AS $$
  SELECT app_current_role() IN ('partner_admin', 'platform_super_admin', 'partner_operations_admin');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_customer_matches(cid uuid) RETURNS boolean AS $$
  SELECT
    app_is_partner_admin()
    OR cid::text = app_current_customer_id()
    OR EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = cid
        AND (
          c.legacy_id = app_current_customer_id()
          OR c.id::text = app_current_customer_id()
        )
    );
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers',
    'microsoft_tenants',
    'domains',
    'customer_contacts',
    'gdap_relationships',
    'gdap_roles',
    'gdap_assignments',
    'gdap_events',
    'onboarding_steps',
    'graph_sync_states',
    'notifications',
    'admin_access_sessions',
    'portal_users',
    'sessions',
    'audit_events',
    'privileged_approvals',
    'feature_flags',
    'jobs',
    'job_attempts',
    'idempotency_keys'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
  END LOOP;
END $$;

CREATE POLICY tenant_isolation ON customers
  FOR ALL
  USING (
    app_is_partner_admin()
    OR id::text = app_current_customer_id()
    OR legacy_id = app_current_customer_id()
  )
  WITH CHECK (
    app_is_partner_admin()
    OR id::text = app_current_customer_id()
    OR legacy_id = app_current_customer_id()
  );

CREATE POLICY tenant_isolation ON microsoft_tenants
  FOR ALL
  USING (app_customer_matches(customer_id))
  WITH CHECK (app_customer_matches(customer_id));

CREATE POLICY tenant_isolation ON domains
  FOR ALL
  USING (
    app_is_partner_admin()
    OR microsoft_tenant_id IN (
      SELECT id FROM microsoft_tenants WHERE app_customer_matches(customer_id)
    )
  );

CREATE POLICY tenant_isolation ON customer_contacts
  FOR ALL
  USING (app_customer_matches(customer_id))
  WITH CHECK (app_customer_matches(customer_id));

CREATE POLICY tenant_isolation ON gdap_relationships
  FOR ALL
  USING (app_customer_matches(customer_id))
  WITH CHECK (app_customer_matches(customer_id));

CREATE POLICY tenant_isolation ON gdap_roles
  FOR ALL
  USING (
    app_is_partner_admin()
    OR relationship_id IN (SELECT id FROM gdap_relationships WHERE app_customer_matches(customer_id))
  );

CREATE POLICY tenant_isolation ON gdap_assignments
  FOR ALL
  USING (
    app_is_partner_admin()
    OR relationship_id IN (SELECT id FROM gdap_relationships WHERE app_customer_matches(customer_id))
  );

CREATE POLICY tenant_isolation ON gdap_events
  FOR ALL
  USING (
    app_is_partner_admin()
    OR relationship_id IN (SELECT id FROM gdap_relationships WHERE app_customer_matches(customer_id))
  );

CREATE POLICY tenant_isolation ON onboarding_steps
  FOR ALL
  USING (app_customer_matches(customer_id))
  WITH CHECK (app_customer_matches(customer_id));

CREATE POLICY tenant_isolation ON graph_sync_states
  FOR ALL
  USING (app_customer_matches(customer_id))
  WITH CHECK (app_customer_matches(customer_id));

CREATE POLICY tenant_isolation ON notifications
  FOR ALL
  USING (
    app_is_partner_admin()
    OR (customer_id IS NOT NULL AND app_customer_matches(customer_id))
    OR (user_id IS NOT NULL AND user_id::text = app_current_user_id())
  );

CREATE POLICY tenant_isolation ON admin_access_sessions
  FOR ALL
  USING (app_is_partner_admin() OR app_customer_matches(customer_id));

CREATE POLICY tenant_isolation ON portal_users
  FOR ALL
  USING (
    app_is_partner_admin()
    OR id::text = app_current_user_id()
    OR legacy_id = app_current_user_id()
    OR (customer_id IS NOT NULL AND app_customer_matches(customer_id))
  );

CREATE POLICY tenant_isolation ON sessions
  FOR ALL
  USING (
    app_is_partner_admin()
    OR user_id::text = app_current_user_id()
  );

CREATE POLICY tenant_isolation ON audit_events
  FOR ALL
  USING (
    app_is_partner_admin()
    OR (target_customer_id IS NOT NULL AND app_customer_matches(target_customer_id))
    OR actor_user_id::text = app_current_user_id()
  );

CREATE POLICY tenant_isolation ON privileged_approvals
  FOR ALL
  USING (app_is_partner_admin())
  WITH CHECK (app_is_partner_admin());

CREATE POLICY tenant_isolation ON feature_flags
  FOR ALL
  USING (app_is_partner_admin())
  WITH CHECK (app_is_partner_admin());

CREATE POLICY tenant_isolation ON jobs
  FOR ALL
  USING (
    app_is_partner_admin()
    OR (customer_id IS NOT NULL AND app_customer_matches(customer_id))
  );

CREATE POLICY tenant_isolation ON job_attempts
  FOR ALL
  USING (
    app_is_partner_admin()
    OR job_id IN (SELECT id FROM jobs WHERE customer_id IS NOT NULL AND app_customer_matches(customer_id))
  );

CREATE POLICY tenant_isolation ON idempotency_keys
  FOR ALL
  USING (
    app_is_partner_admin()
    OR (customer_id IS NOT NULL AND app_customer_matches(customer_id))
  );
