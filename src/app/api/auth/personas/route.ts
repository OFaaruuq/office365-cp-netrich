import { NextResponse } from "next/server";
import { PORTAL_ACCOUNTS } from "@/lib/tenancy-data";
import { isDemoLoginAllowed } from "@/lib/auth/demo-mode";

/**
 * Demo personas for the sign-in picker.
 * Only available when demo login is allowed — never ship account IDs in production UI bundles blindly.
 */
export async function GET() {
  if (!isDemoLoginAllowed()) {
    return NextResponse.json(
      {
        accounts: [],
        demoLogin: false,
        error: "Demo personas are disabled in this environment.",
        code: "DEMO_LOGIN_DISABLED",
      },
      { status: 403 }
    );
  }

  // Strip nothing critical — these are demo IDs — but do not include secrets (there are none).
  const accounts = PORTAL_ACCOUNTS.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    role: a.role,
    customerId: a.customerId,
    team: a.team,
    title: a.title,
  }));

  return NextResponse.json({ accounts, demoLogin: true });
}
