import { NextResponse } from "next/server";
import { isDemoLoginAllowed } from "@/lib/auth/demo-mode";

/**
 * Public personas listing is disabled — the login page must not expose tenants.
 * Kept for API compatibility; always returns an empty list.
 */
export async function GET() {
  return NextResponse.json({
    accounts: [],
    demoLogin: isDemoLoginAllowed(),
    message: "Persona picker disabled. Use email/password on the sign-in page.",
  });
}
