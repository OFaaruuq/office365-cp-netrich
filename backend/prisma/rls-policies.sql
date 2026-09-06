-- Enable RLS on tenant-scoped tables (run after prisma migrate)
-- Usage from API: SET LOCAL app.customer_id = '...'; SET LOCAL app.role = '...';

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
    'onboarding_steps',
    'graph_sync_states',
    'notifications',
    'admin_access_sessions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
  END LOOP;
END $$;

-- customers: partner admin sees all; others only own customer row
CREATE POLICY tenant_isolation ON customers
  FOR ALL
  USING (
    app_is_partner_admin()
    OR id::text = app_current_customer_id()
  )
  WITH CHECK (
    app_is_partner_admin()
    OR id::text = app_current_customer_id()
  );

CREATE POLICY tenant_isolation ON microsoft_tenants
  FOR ALL
  USING (app_is_partner_admin() OR customer_id::text = app_current_customer_id())
  WITH CHECK (app_is_partner_admin() OR customer_id::text = app_current_customer_id());

CREATE POLICY tenant_isolation ON domains
  FOR ALL
  USING (
    app_is_partner_admin()
    OR microsoft_tenant_id IN (
      SELECT id FROM microsoft_tenants WHERE customer_id::text = app_current_customer_id()
    )
  );

CREATE POLICY tenant_isolation ON customer_contacts
  FOR ALL
  USING (app_is_partner_admin() OR customer_id::text = app_current_customer_id())
  WITH CHECK (app_is_partner_admin() OR customer_id::text = app_current_customer_id());

CREATE POLICY tenant_isolation ON gdap_relationships
  FOR ALL
  USING (app_is_partner_admin() OR customer_id::text = app_current_customer_id())
  WITH CHECK (app_is_partner_admin() OR customer_id::text = app_current_customer_id());

CREATE POLICY tenant_isolation ON onboarding_steps
  FOR ALL
  USING (app_is_partner_admin() OR customer_id::text = app_current_customer_id())
  WITH CHECK (app_is_partner_admin() OR customer_id::text = app_current_customer_id());

CREATE POLICY tenant_isolation ON graph_sync_states
  FOR ALL
  USING (app_is_partner_admin() OR customer_id::text = app_current_customer_id())
  WITH CHECK (app_is_partner_admin() OR customer_id::text = app_current_customer_id());

CREATE POLICY tenant_isolation ON notifications
  FOR ALL
  USING (
    app_is_partner_admin()
    OR customer_id::text = app_current_customer_id()
    OR customer_id IS NULL
  );

CREATE POLICY tenant_isolation ON admin_access_sessions
  FOR ALL
  USING (app_is_partner_admin() OR customer_id::text = app_current_customer_id());
