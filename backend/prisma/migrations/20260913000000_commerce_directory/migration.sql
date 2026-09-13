-- Directory, commerce, security, support, integrations
CREATE TABLE IF NOT EXISTS directory_users (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  graph_user_id TEXT,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  upn TEXT,
  status TEXT NOT NULL,
  licenses JSONB NOT NULL,
  synced_from_graph BOOLEAN NOT NULL DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, email)
);
CREATE INDEX IF NOT EXISTS directory_users_customer_id_idx ON directory_users(customer_id);

CREATE TABLE IF NOT EXISTS directory_groups (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  graph_id TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  members INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'local',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS directory_groups_customer_id_idx ON directory_groups(customer_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sku_id TEXT,
  name TEXT NOT NULL,
  purchased INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  billing_cycle TEXT NOT NULL DEFAULT 'Monthly',
  unit_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  next_renewal_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  partner_center_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_customer_id_idx ON subscriptions(customer_id);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  total_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_by TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders(customer_id);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku_id TEXT,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DOUBLE PRECISION NOT NULL,
  action TEXT NOT NULL DEFAULT 'add'
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  partner_center_id TEXT,
  amount DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'open',
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_customer_id_idx ON invoices(customer_id);

CREATE TABLE IF NOT EXISTS security_snapshots (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  secure_score INTEGER NOT NULL DEFAULT 0,
  mfa_percent INTEGER NOT NULL DEFAULT 0,
  threat_count INTEGER NOT NULL DEFAULT 0,
  payload JSONB,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_snapshots_customer_id_idx ON security_snapshots(customer_id);

CREATE TABLE IF NOT EXISTS support_threads (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  team TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_threads_customer_id_idx ON support_threads(customer_id);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  secrets_ref TEXT,
  config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, provider)
);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'directory_users', 'directory_groups', 'subscriptions', 'orders', 'order_items',
    'invoices', 'security_snapshots', 'support_threads', 'support_messages', 'integrations'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
  END LOOP;
END $$;

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
