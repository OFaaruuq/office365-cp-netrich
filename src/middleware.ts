import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, decodeSessionToken } from "@/lib/auth/server-session";

const PUBLIC_PATHS = new Set(["/", "/api/auth/session"]);

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

  const token = request.cookies.get(SESSION_COOKIE)?.value;
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
          error: "Super Admin only. Tenants are isolated and clients cannot access admin APIs.",
          code: "SUPER_ADMIN_REQUIRED",
        },
        { status: 403 }
      );
    }
    return NextResponse.next();
  }

  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("next", pathname);
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
