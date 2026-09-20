-- Add WITH CHECK to tenant policies that only had USING (L4).
ALTER POLICY tenant_isolation ON domains
  WITH CHECK (
    app_is_partner_admin()
    OR microsoft_tenant_id IN (
      SELECT id FROM microsoft_tenants WHERE app_customer_matches(customer_id)
    )
  );

ALTER POLICY tenant_isolation ON gdap_roles
  WITH CHECK (
    app_is_partner_admin()
    OR relationship_id IN (SELECT id FROM gdap_relationships WHERE app_customer_matches(customer_id))
  );

ALTER POLICY tenant_isolation ON gdap_assignments
  WITH CHECK (
    app_is_partner_admin()
    OR relationship_id IN (SELECT id FROM gdap_relationships WHERE app_customer_matches(customer_id))
  );

ALTER POLICY tenant_isolation ON gdap_events
  WITH CHECK (
    app_is_partner_admin()
    OR relationship_id IN (SELECT id FROM gdap_relationships WHERE app_customer_matches(customer_id))
  );

ALTER POLICY tenant_isolation ON notifications
  WITH CHECK (
    app_is_partner_admin()
    OR (customer_id IS NOT NULL AND app_customer_matches(customer_id))
    OR (user_id IS NOT NULL AND user_id::text = app_current_user_id())
  );

ALTER POLICY tenant_isolation ON admin_access_sessions
  WITH CHECK (app_is_partner_admin() OR app_customer_matches(customer_id));

ALTER POLICY tenant_isolation ON portal_users
  WITH CHECK (
    app_is_partner_admin()
    OR id::text = app_current_user_id()
    OR legacy_id = app_current_user_id()
    OR (customer_id IS NOT NULL AND app_customer_matches(customer_id))
  );

ALTER POLICY tenant_isolation ON sessions
  WITH CHECK (
    app_is_partner_admin()
    OR user_id::text = app_current_user_id()
  );

ALTER POLICY tenant_isolation ON audit_events
  WITH CHECK (
    app_is_partner_admin()
    OR (target_customer_id IS NOT NULL AND app_customer_matches(target_customer_id))
    OR actor_user_id::text = app_current_user_id()
  );

ALTER POLICY tenant_isolation ON jobs
  WITH CHECK (
    app_is_partner_admin()
    OR (customer_id IS NOT NULL AND app_customer_matches(customer_id))
  );

ALTER POLICY tenant_isolation ON job_attempts
  WITH CHECK (
    app_is_partner_admin()
    OR job_id IN (SELECT id FROM jobs WHERE customer_id IS NOT NULL AND app_customer_matches(customer_id))
  );

ALTER POLICY tenant_isolation ON idempotency_keys
  WITH CHECK (
    app_is_partner_admin()
    OR (customer_id IS NOT NULL AND app_customer_matches(customer_id))
  );
