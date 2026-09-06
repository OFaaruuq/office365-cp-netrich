"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Package,
  Users,
  Cloud,
  Server,
  Box,
  MessageSquare,
  Mail,
  Shield,
  Building2,
  Headphones,
  Activity,
  FileText,
  KeyRound,
  Settings,
  Bell,
  Briefcase,
  RefreshCw,
  Receipt,
  Layers,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useSession } from "@/components/auth/SessionProvider";
import { useNav } from "@/components/layout/NavProvider";
import { portalFetch } from "@/lib/admin-api";

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "flex items-center gap-2.5 border-l-[3px] px-4 py-2 text-[13px] transition-colors",
        active
          ? "border-nt-purple bg-nt-purple-soft font-semibold text-nt-purple"
          : "border-transparent text-[#555] hover:bg-white hover:text-nt-text"
      )}
    >
      <Icon size={15} strokeWidth={1.75} className={active ? "text-nt-purple" : "opacity-80"} />
      {label}
    </Link>
  );
}

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2 border-t border-nt-border pt-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-2 text-[11px] font-semibold tracking-wide text-[#777] uppercase"
      >
        {title}
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && children}
    </div>
  );
}

const ALL_CATALOGS = [
  { id: "microsoft-365", href: "/catalog/microsoft-365", label: "Microsoft 365", icon: Cloud },
  { id: "dynamics-365", href: "/catalog/dynamics-365", label: "Dynamics 365", icon: Box },
  { id: "server-software", href: "/catalog/server-software", label: "Server Software", icon: Server },
  { id: "azure", href: "/catalog/azure", label: "Microsoft Azure", icon: Cloud },
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  const { isPartner, isSupport, isClient, user } = useSession();
  const { mobileOpen, closeMobile } = useNav();
  const [open, setOpen] = useState<Record<string, boolean>>({
    customers: true,
    commerce: true,
    billing: true,
    microsoft: true,
    security: true,
    support: true,
    platform: true,
    m365: true,
    products: true,
    custBilling: false,
    custSecurity: true,
    account: false,
  });
  const [allowedCatalogs, setAllowedCatalogs] = useState<string[] | null>(null);

  useEffect(() => {
    if (!isClient || !user?.customerId) {
      setAllowedCatalogs(null);
      return;
    }
    let cancelled = false;
    void portalFetch("/api/me/tenant")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAllowedCatalogs(data.tenant?.allowedCatalogs || ["microsoft-365"]);
      })
      .catch(() => {
        if (!cancelled) setAllowedCatalogs(["microsoft-365"]);
      });
    return () => {
      cancelled = true;
    };
  }, [isClient, user?.customerId]);

  const catalogs = useMemo(() => {
    if (isPartner || !isClient) return [...ALL_CATALOGS];
    const allowed = allowedCatalogs || ["microsoft-365"];
    return ALL_CATALOGS.filter((c) => allowed.includes(c.id));
  }, [isPartner, isClient, allowedCatalogs]);

  function toggle(key: string) {
    setOpen((o) => ({ ...o, [key]: !o[key] }));
  }

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="nt-sidebar-overlay lg:hidden"
          onClick={closeMobile}
        />
      )}
      <aside
        className={clsx(
          "nt-sidebar fixed bottom-0 left-0 top-[60px] z-50 w-[228px] overflow-y-auto border-r border-nt-border bg-[#fafafa] shadow-[2px_0_12px_rgba(0,0,0,0.03)] nt-scroll lg:z-40",
          mobileOpen && "open"
        )}
      >
        {user && (
          <div className="border-b border-nt-border px-4 py-3">
            <div className="text-[10px] font-bold tracking-wide text-nt-text-subtle uppercase">
              Signed in
            </div>
            <div className="truncate text-xs font-semibold text-nt-text">{user.name}</div>
            <div className="truncate text-[11px] text-nt-text-muted">{user.title}</div>
            {user.customerName && (
              <div className="mt-1 truncate text-[11px] text-nt-purple">{user.customerName}</div>
            )}
          </div>
        )}

        <nav className="flex flex-col py-3 pb-24">
          {isPartner && (
            <>
              <div className="px-4 pb-1 text-[10px] font-bold tracking-wide text-nt-purple uppercase">
                Partner Control Center
              </div>
              <NavLink
                href="/admin"
                label="Overview"
                icon={LayoutDashboard}
                active={pathname === "/admin"}
              />

              <Section title="Customers" open={open.customers} onToggle={() => toggle("customers")}>
                <NavLink
                  href="/admin/tenants"
                  label="All Customers"
                  icon={Building2}
                  active={pathname.startsWith("/admin/tenants") || pathname.startsWith("/admin/customers")}
                />
                <NavLink
                  href="/admin/onboarding"
                  label="Onboarding"
                  icon={Layers}
                  active={pathname.startsWith("/admin/onboarding")}
                />
                <NavLink
                  href="/admin/gdap"
                  label="GDAP Relationships"
                  icon={KeyRound}
                  active={pathname.startsWith("/admin/gdap")}
                />
              </Section>

              <Section title="Commerce" open={open.commerce} onToggle={() => toggle("commerce")}>
                <NavLink
                  href="/admin/catalog"
                  label="Catalog"
                  icon={Package}
                  active={pathname.startsWith("/admin/catalog")}
                />
                <NavLink
                  href="/admin/commerce/pricing"
                  label="Pricing"
                  icon={Receipt}
                  active={pathname.startsWith("/admin/commerce/pricing")}
                />
                <NavLink
                  href="/admin/commerce/quotes"
                  label="Quotes"
                  icon={FileText}
                  active={pathname.startsWith("/admin/commerce/quotes")}
                />
                <NavLink
                  href="/admin/commerce/orders"
                  label="Orders"
                  icon={Briefcase}
                  active={pathname.startsWith("/admin/commerce/orders")}
                />
                <NavLink
                  href="/admin/commerce/subscriptions"
                  label="Subscriptions"
                  icon={Package}
                  active={pathname.startsWith("/admin/commerce/subscriptions")}
                />
                <NavLink
                  href="/admin/commerce/renewals"
                  label="Renewals"
                  icon={RefreshCw}
                  active={pathname.startsWith("/admin/commerce/renewals")}
                />
              </Section>

              <Section title="Billing" open={open.billing} onToggle={() => toggle("billing")}>
                <NavLink
                  href="/admin/billing/invoices"
                  label="Invoices"
                  icon={Receipt}
                  active={pathname.startsWith("/admin/billing")}
                />
              </Section>

              <Section title="Microsoft" open={open.microsoft} onToggle={() => toggle("microsoft")}>
                <NavLink
                  href="/admin/microsoft/integration"
                  label="Integration Health"
                  icon={Activity}
                  active={pathname === "/admin/microsoft/integration"}
                />
                <NavLink
                  href="/admin/microsoft/graph-sync"
                  label="Graph Sync"
                  icon={RefreshCw}
                  active={pathname.startsWith("/admin/microsoft/graph-sync")}
                />
              </Section>

              <Section title="Security" open={open.security} onToggle={() => toggle("security")}>
                <NavLink
                  href="/admin/security/audit"
                  label="Audit Logs"
                  icon={Shield}
                  active={pathname === "/admin/security/audit"}
                />
                <NavLink
                  href="/admin/security/approvals"
                  label="Approvals"
                  icon={KeyRound}
                  active={pathname.startsWith("/admin/security/approvals")}
                />
                <NavLink
                  href="/admin/security/roles"
                  label="Roles"
                  icon={Users}
                  active={pathname.startsWith("/admin/security/roles")}
                />
                <NavLink
                  href="/admin/security/break-glass"
                  label="Break-glass"
                  icon={Shield}
                  active={pathname.startsWith("/admin/security/break-glass")}
                />
              </Section>

              <Section title="Support" open={open.support} onToggle={() => toggle("support")}>
                <NavLink
                  href="/support"
                  label="Inbox"
                  icon={Headphones}
                  active={pathname.startsWith("/support")}
                />
              </Section>

              <Section title="Platform" open={open.platform} onToggle={() => toggle("platform")}>
                <NavLink
                  href="/admin/users"
                  label="Portal Users"
                  icon={Users}
                  active={pathname.startsWith("/admin/users")}
                />
                <NavLink
                  href="/admin/platform/jobs"
                  label="Jobs & DLQ"
                  icon={Activity}
                  active={pathname.startsWith("/admin/platform/jobs")}
                />
                <NavLink
                  href="/admin/platform/flags"
                  label="Feature Flags"
                  icon={Settings}
                  active={pathname.startsWith("/admin/platform/flags")}
                />
              </Section>
            </>
          )}

          {isSupport && !isPartner && (
            <NavLink
              href="/support"
              label="Support Inbox"
              icon={Headphones}
              active={pathname.startsWith("/support")}
            />
          )}

          {(isClient || isPartner) && (
            <>
              <div className="mt-3 border-t border-nt-border px-4 pb-1 pt-3 text-[10px] font-bold tracking-wide text-[#777] uppercase">
                {isClient ? "Workspace" : "Inspect workspace"}
              </div>
              <NavLink
                href="/dashboard"
                label="Dashboard"
                icon={LayoutDashboard}
                active={pathname === "/dashboard"}
              />

              <Section title="Microsoft 365" open={open.m365} onToggle={() => toggle("m365")}>
                <NavLink href="/users" label="Users" icon={Users} active={pathname === "/users"} />
                <NavLink
                  href="/products"
                  label="Licenses"
                  icon={Package}
                  active={pathname === "/products"}
                />
                <NavLink
                  href="/workspace/groups"
                  label="Groups"
                  icon={Users}
                  active={pathname.startsWith("/workspace/groups")}
                />
                <NavLink
                  href="/workspace/domains"
                  label="Domains"
                  icon={Cloud}
                  active={pathname.startsWith("/workspace/domains")}
                />
                <NavLink
                  href="/workspace/service-health"
                  label="Service Health"
                  icon={Activity}
                  active={pathname.startsWith("/workspace/service-health")}
                />
              </Section>

              <Section title="Products" open={open.products} onToggle={() => toggle("products")}>
                <NavLink
                  href="/products"
                  label="Subscriptions"
                  icon={Package}
                  active={pathname === "/products"}
                />
                {catalogs.map((link) => (
                  <NavLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    icon={link.icon}
                    active={pathname === link.href}
                  />
                ))}
                <NavLink
                  href="/workspace/renewals"
                  label="Renewals"
                  icon={RefreshCw}
                  active={pathname.startsWith("/workspace/renewals")}
                />
              </Section>

              <Section
                title="Billing"
                open={open.custBilling}
                onToggle={() => toggle("custBilling")}
              >
                <NavLink
                  href="/workspace/billing"
                  label="Cost Overview"
                  icon={Receipt}
                  active={pathname.startsWith("/workspace/billing")}
                />
              </Section>

              <Section
                title="Security"
                open={open.custSecurity}
                onToggle={() => toggle("custSecurity")}
              >
                <NavLink
                  href="/solutions/security"
                  label="Security Overview"
                  icon={Shield}
                  active={pathname.startsWith("/solutions/security")}
                />
              </Section>

              <Section title="Support" open={open.support} onToggle={() => toggle("support")}>
                <NavLink
                  href="/support"
                  label={isPartner ? "Support Inbox" : "Tickets"}
                  icon={MessageSquare}
                  active={pathname.startsWith("/support")}
                />
              </Section>

              <Section title="Account" open={open.account} onToggle={() => toggle("account")}>
                <NavLink
                  href="/workspace/organization"
                  label="Organization"
                  icon={Building2}
                  active={pathname.startsWith("/workspace/organization")}
                />
                <NavLink
                  href="/workspace/administrators"
                  label="Administrators"
                  icon={Users}
                  active={pathname.startsWith("/workspace/administrators")}
                />
                <NavLink
                  href="/workspace/notifications"
                  label="Notifications"
                  icon={Bell}
                  active={pathname.startsWith("/workspace/notifications")}
                />
                <NavLink
                  href="/workspace/sessions"
                  label="Active sessions"
                  icon={KeyRound}
                  active={pathname.startsWith("/workspace/sessions")}
                />
                <NavLink
                  href="/workspace/audit"
                  label="Audit Log"
                  icon={FileText}
                  active={pathname.startsWith("/workspace/audit")}
                />
                <NavLink
                  href="/solutions/collaboration"
                  label="Collaboration"
                  icon={MessageSquare}
                  active={pathname.startsWith("/solutions/collaboration")}
                />
                <NavLink
                  href="/solutions/email-data"
                  label="Email And Data"
                  icon={Mail}
                  active={pathname.startsWith("/solutions/email-data")}
                />
              </Section>
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
