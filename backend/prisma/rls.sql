-- Row Level Security helpers for netrich CSP
-- Applied after Prisma migrate. Partner Super Admin bypasses via app.role = 'partner_admin'.

CREATE OR REPLACE FUNCTION app_current_customer_id() RETURNS text AS $$
  SELECT nullif(current_setting('app.customer_id', true), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_current_role() RETURNS text AS $$
  SELECT coalesce(nullif(current_setting('app.role', true), ''), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_is_partner_admin() RETURNS boolean AS $$
  SELECT app_current_role() IN ('partner_admin', 'platform_super_admin', 'partner_operations_admin');
$$ LANGUAGE sql STABLE;
