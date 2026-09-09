import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, LEGACY_SESSION_COOKIE, decodeSessionToken } from "@/lib/auth/server-session";

const PUBLIC_PATHS = new Set([
  "/",
  "/api/auth/session",
  "/api/auth/personas",
  "/api/auth/mfa",
]);

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/favicon")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  if (/\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|map|txt|woff2?)$/i.test(pathname)) {
    return NextResponse.next();
  }

  const token =
    request.cookies.get(SESSION_COOKIE)?.value ||
    request.cookies.get(LEGACY_SESSION_COOKIE)?.value;
  const session = await decodeSessionToken(token);

  if (pathname.startsWith("/api/")) {
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    if (pathname.startsWith("/api/admin") && session.role !== "partner_admin") {
      return NextResponse.json(
        {
          error: "Access denied.",
          code: "SUPER_ADMIN_REQUIRED",
        },
        { status: 403 }
      );
    }
    const inspectActive = (session.inspect?.exp ?? 0) >= Math.floor(Date.now() / 1000);
    if (inspectActive && pathname.startsWith("/api/admin")) {
      return NextResponse.json(
        { error: "View-as-customer is read-only", code: "READ_ONLY" },
        { status: 403 }
      );
    }
    if (
      inspectActive &&
      request.method !== "GET" &&
      request.method !== "HEAD" &&
      request.method !== "OPTIONS"
    ) {
      const allowEnd = pathname === "/api/csp/admin-access/end" && request.method === "POST";
      const allowLogout = pathname === "/api/auth/session" && request.method === "DELETE";
      if (!allowEnd && !allowLogout) {
        return NextResponse.json(
          { error: "View-as-customer is read-only", code: "READ_ONLY" },
          { status: 403 }
        );
      }
    }
    return NextResponse.next();
  }

  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const inspectClaim =
    session.role === "partner_admin" && (session.inspect?.exp ?? 0) >= Math.floor(Date.now() / 1000)
      ? session.inspect
      : null;
  if (inspectClaim && (pathname.startsWith("/admin") || pathname.startsWith("/support"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.searchParams.set("customerId", inspectClaim.customerId);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin") && session.role !== "partner_admin") {
    const url = request.nextUrl.clone();
    url.pathname =
      session.role === "customer_admin"
        ? "/dashboard"
        : session.role.startsWith("support")
          ? "/support"
          : "/";
    return NextResponse.redirect(url);
  }

  if (
    pathname.startsWith("/support") &&
    session.role !== "partner_admin" &&
    session.role !== "support_technical" &&
    session.role !== "support_billing"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = session.role === "customer_admin" ? "/dashboard" : "/";
    return NextResponse.redirect(url);
  }

  const support =
    session.role === "support_technical" || session.role === "support_billing";
  if (
    support &&
    (pathname.startsWith("/dashboard") ||
      pathname.startsWith("/users") ||
      pathname.startsWith("/products") ||
      pathname.startsWith("/workspace") ||
      pathname.startsWith("/catalog") ||
      pathname.startsWith("/solutions") ||
      pathname.startsWith("/admin"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/support";
    return NextResponse.redirect(url);
  }

  if (
    session.role === "customer_admin" &&
    request.nextUrl.searchParams.has("customerId") &&
    request.nextUrl.searchParams.get("customerId") !== session.customerId
  ) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("customerId");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
