export async function acquirePartnerCenterToken(): Promise<
  { ok: true; accessToken: string } | { ok: false; code: string; message: string }
> {
  const clientId = process.env.PARTNER_CENTER_APP_ID || process.env.GRAPH_CLIENT_ID || "";
  const clientSecret = process.env.PARTNER_CENTER_APP_SECRET || process.env.GRAPH_CLIENT_SECRET || "";
  const tenant = process.env.PARTNER_CENTER_TENANT_ID || process.env.AZURE_AD_TENANT_ID || "";
  if (!clientId || !clientSecret || !tenant) {
    return {
      ok: false,
      code: "PC_NOT_CONFIGURED",
      message: "Set PARTNER_CENTER_APP_ID, PARTNER_CENTER_APP_SECRET, and PARTNER_CENTER_TENANT_ID for read-only Partner Center.",
    };
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "https://api.partnercenter.microsoft.com/.default",
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    return { ok: false, code: "PC_TOKEN_FAILED", message: (await res.text()).slice(0, 400) };
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) return { ok: false, code: "PC_TOKEN_FAILED", message: "Missing access_token" };
  return { ok: true, accessToken: json.access_token };
}

export function partnerCenterWritesEnabled() {
  return process.env.PARTNER_CENTER_WRITES_ENABLED === "true";
}

export async function partnerCenterGet<T>(accessToken: string, path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `https://api.partnercenter.microsoft.com${path}`;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid Partner Center URL");
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "api.partnercenter.microsoft.com") {
    throw new Error(`Refusing Partner Center request to ${parsed.hostname}`);
  }
  const res = await fetch(parsed.toString(), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Partner Center ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

export async function listPartnerCenterCustomers(accessToken: string) {
  const data = await partnerCenterGet<{
    items?: Array<{
      id?: string;
      companyProfile?: { companyName?: string; domain?: string };
    }>;
  }>(accessToken, "/v1/customers");
  return (data.items || []).map((c) => ({
    id: c.id,
    name: c.companyProfile?.companyName || c.id,
    domain: c.companyProfile?.domain,
    source: "partner_center" as const,
  }));
}
