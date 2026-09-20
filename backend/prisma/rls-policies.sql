-- Enable + FORCE RLS on tenant-scoped tables (run after prisma migrate)
-- Canonical copy also lives in migrations/20260909000000_rls_force_isolation.

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
    'idempotency_keys',
    'directory_users',
    'directory_groups',
    'subscriptions',
    'orders',
    'order_items',
    'invoices',
    'security_snapshots',
    'support_threads',
    'support_messages',
    'integrations'
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
  )
  WITH CHECK (
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
  )
  WITH CHECK (
    app_is_partner_admin()
    OR relationship_id IN (SELECT id FROM gdap_relationships WHERE app_customer_matches(customer_id))
  );

CREATE POLICY tenant_isolation ON gdap_assignments
  FOR ALL
  USING (
    app_is_partner_admin()
    OR relationship_id IN (SELECT id FROM gdap_relationships WHERE app_customer_matches(customer_id))
  )
  WITH CHECK (
    app_is_partner_admin()
    OR relationship_id IN (SELECT id FROM gdap_relationships WHERE app_customer_matches(customer_id))
  );

CREATE POLICY tenant_isolation ON gdap_events
  FOR ALL
  USING (
    app_is_partner_admin()
    OR relationship_id IN (SELECT id FROM gdap_relationships WHERE app_customer_matches(customer_id))
  )
  WITH CHECK (
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
  )
  WITH CHECK (
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
  )
  WITH CHECK (
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

CREATE POLICY tenant_isolation ON directory_users FOR ALL USING (app_customer_matches(customer_id)) WITH CHECK (app_customer_matches(customer_id));
CREATE POLICY tenant_isolation ON directory_groups FOR ALL USING (app_customer_matches(customer_id)) WITH CHECK (app_customer_matches(customer_id));
CREATE POLICY tenant_isolation ON subscriptions FOR ALL USING (app_customer_matches(customer_id)) WITH CHECK (app_customer_matches(customer_id));
CREATE POLICY tenant_isolation ON orders FOR ALL USING (app_customer_matches(customer_id)) WITH CHECK (app_customer_matches(customer_id));
CREATE POLICY tenant_isolation ON order_items FOR ALL USING (
  app_is_partner_admin() OR order_id IN (SELECT id FROM orders WHERE app_customer_matches(customer_id))
);
CREATE POLICY tenant_isolation ON invoices FOR ALL USING (app_customer_matches(customer_id)) WITH CHECK (app_customer_matches(customer_id));
CREATE POLICY tenant_isolation ON security_snapshots FOR ALL USING (app_customer_matches(customer_id)) WITH CHECK (app_customer_matches(customer_id));
CREATE POLICY tenant_isolation ON support_threads FOR ALL USING (app_customer_matches(customer_id)) WITH CHECK (app_customer_matches(customer_id));
CREATE POLICY tenant_isolation ON support_messages FOR ALL USING (
  app_is_partner_admin() OR thread_id IN (SELECT id FROM support_threads WHERE app_customer_matches(customer_id))
);
CREATE POLICY tenant_isolation ON integrations FOR ALL USING (app_customer_matches(customer_id)) WITH CHECK (app_customer_matches(customer_id));
