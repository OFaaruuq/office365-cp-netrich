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
  MoreHorizontal,
  Building2,
  Headphones,
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
        "flex items-center gap-2.5 border-l-[3px] px-4 py-2.5 text-[13px] transition-colors",
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

const ALL_CATALOGS = [
  { id: "microsoft-365", href: "/catalog/microsoft-365", label: "Microsoft 365", icon: Cloud },
  { id: "dynamics-365", href: "/catalog/dynamics-365", label: "Dynamics 365", icon: Box },
  {
    id: "server-software",
    href: "/catalog/server-software",
    label: "Server Software",
    icon: Server,
  },
  { id: "azure", href: "/catalog/azure", label: "Microsoft Azure", icon: Cloud },
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  const { isPartner, isSupport, isClient, user } = useSession();
  const { mobileOpen, closeMobile } = useNav();
  const [catalogsOpen, setCatalogsOpen] = useState(true);
  const [solutionsOpen, setSolutionsOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
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
        if (cancelled) return;
        setAllowedCatalogs(data.tenant?.allowedCatalogs || ["microsoft-365"]);
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

  const solutions = [
    { href: "/solutions/collaboration", label: "Collaboration Tools", icon: MessageSquare },
    { href: "/solutions/email-data", label: "Email And Data", icon: Mail },
    { href: "/solutions/security", label: "Security Report", icon: Shield },
  ];

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
          {(isPartner || isSupport) && (
            <>
              {isPartner && (
                <>
                  <NavLink
                    href="/admin"
                    label="Super Admin"
                    icon={Shield}
                    active={pathname === "/admin"}
                  />
                  <NavLink
                    href="/admin/customers"
                    label="Client Tenants"
                    icon={Building2}
                    active={pathname.startsWith("/admin/customers")}
                  />
                </>
              )}
              <NavLink
                href="/support"
                label="Support Inbox"
                icon={Headphones}
                active={pathname.startsWith("/support")}
              />
              {isSupport && (
                <div className="mx-4 mt-3 rounded-lg bg-nt-purple-soft px-3 py-2 text-[11px] text-nt-purple">
                  Claim queued chats, introduce yourself, and reply live to client admins.
                </div>
              )}
            </>
          )}

          {(isClient || isPartner) && (
            <>
              <div className="mt-2 border-t border-nt-border pt-2" />
              <NavLink
                href="/dashboard"
                label="Dashboard"
                icon={LayoutDashboard}
                active={pathname === "/dashboard"}
              />
              <NavLink
                href="/products"
                label="My Products"
                icon={Package}
                active={pathname === "/products"}
              />
              <NavLink
                href="/users"
                label="My Users"
                icon={Users}
                active={pathname === "/users"}
              />

              <div className="mt-2 border-t border-nt-border pt-2">
                <button
                  type="button"
                  onClick={() => setCatalogsOpen(!catalogsOpen)}
                  className="flex w-full items-center justify-between px-4 py-2 text-[11px] font-semibold tracking-wide text-[#777] uppercase"
                >
                  Product Catalogs
                  {catalogsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {catalogsOpen &&
                  catalogs.map((link) => (
                    <NavLink
                      key={link.href}
                      href={link.href}
                      label={link.label}
                      icon={link.icon}
                      active={pathname === link.href}
                    />
                  ))}
              </div>

              <div className="mt-2 border-t border-nt-border pt-2">
                <button
                  type="button"
                  onClick={() => setSolutionsOpen(!solutionsOpen)}
                  className="flex w-full items-center justify-between px-4 py-2 text-[11px] font-semibold tracking-wide text-[#777] uppercase"
                >
                  Solution Paths
                  {solutionsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {solutionsOpen &&
                  solutions.map((link) => (
                    <NavLink key={link.href} {...link} active={pathname === link.href} />
                  ))}
              </div>

              <div className="mt-2 border-t border-nt-border pt-2">
                <button
                  type="button"
                  onClick={() => setMoreOpen(!moreOpen)}
                  className="flex w-full items-center gap-2.5 border-l-[3px] border-transparent px-4 py-2.5 text-[13px] text-[#555] hover:bg-white"
                >
                  <MoreHorizontal size={15} />
                  More...
                  <ChevronDown
                    size={14}
                    className={clsx("ml-auto transition-transform", moreOpen && "rotate-180")}
                  />
                </button>
                {moreOpen && (
                  <div className="pb-2">
                    {["Billing History", "Invoices", "Account Settings"].map((label) => (
                      <Link
                        key={label}
                        href="/dashboard"
                        className="block py-2 pr-3 pl-11 text-[13px] text-[#555] hover:bg-white"
                      >
                        {label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
