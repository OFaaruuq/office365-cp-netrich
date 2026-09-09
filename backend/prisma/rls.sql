-- Row Level Security helpers for netrich CSP
-- Applied after Prisma migrate. Partner Super Admin bypasses via app.role = 'partner_admin'.
-- FORCE RLS is applied in 20260909000000_rls_force_isolation. Superuser connections still bypass;
-- production DATABASE_URL should use a non-superuser role.

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
