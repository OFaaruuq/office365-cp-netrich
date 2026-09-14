import { NextResponse } from "next/server";

/**
 * Public personas listing is disabled — the login page must not expose tenants.
 */
export async function GET() {
  return NextResponse.json({
    accounts: [],
    demoLogin: false,
    message: "Use Sign in with Microsoft. Emergency access is for break-glass accounts only.",
  });
}
