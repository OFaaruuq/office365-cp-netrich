export type GraphTokenResult =
  | { ok: true; accessToken: string; source: "client_credentials" | "access_token_env" }
  | { ok: false; code: string; message: string };

export async function acquireGraphToken(entraTenantId?: string): Promise<GraphTokenResult> {
  if (process.env.GRAPH_ACCESS_TOKEN) {
    return { ok: true, accessToken: process.env.GRAPH_ACCESS_TOKEN, source: "access_token_env" };
  }
  const clientId = process.env.GRAPH_CLIENT_ID || process.env.AZURE_AD_API_CLIENT_ID || "";
  const clientSecret = process.env.GRAPH_CLIENT_SECRET || process.env.AZURE_AD_API_CLIENT_SECRET || "";
  const tenant = entraTenantId || process.env.GRAPH_TENANT_ID || process.env.AZURE_AD_TENANT_ID || "";
  if (!clientId || !clientSecret || !tenant || tenant === "common" || tenant === "organizations") {
    return {
      ok: false,
      code: "GRAPH_NOT_CONFIGURED",
      message:
        "Set GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, and the customer Entra tenant id (or GRAPH_TENANT_ID) for app-only Graph.",
    };
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, code: "GRAPH_TOKEN_FAILED", message: text.slice(0, 500) };
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    return { ok: false, code: "GRAPH_TOKEN_FAILED", message: "Token response missing access_token" };
  }
  return { ok: true, accessToken: json.access_token, source: "client_credentials" };
}

export async function graphGet<T>(accessToken: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

export type SyncedDirectoryUser = {
  id: string;
  displayName: string;
  email: string;
  status: "active" | "blocked";
  licenses: string[];
  syncedFromGraph: true;
  lastSyncedAt: string;
};

type GraphUsersPage = {
  value: Array<{
    id: string;
    displayName?: string;
    mail?: string;
    userPrincipalName: string;
    accountEnabled: boolean;
    assignedLicenses?: Array<{ skuId: string }>;
  }>;
  "@odata.nextLink"?: string;
};

export async function syncDirectoryUsers(
  accessToken: string
): Promise<SyncedDirectoryUser[]> {
  type Skus = { value: Array<{ skuId: string; skuPartNumber: string }> };
  const skus = await graphGet<Skus>(accessToken, "https://graph.microsoft.com/v1.0/subscribedSkus");
  const skuMap = new Map(skus.value.map((s) => [s.skuId, s.skuPartNumber]));
  const users: SyncedDirectoryUser[] = [];
  let next: string | undefined =
    "https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,accountEnabled,assignedLicenses&$top=999";
  const now = new Date().toISOString();
  while (next) {
    const page: GraphUsersPage = await graphGet<GraphUsersPage>(accessToken, next);
    for (const u of page.value) {
      users.push({
        id: u.id,
        displayName: u.displayName || u.userPrincipalName,
        email: (u.mail || u.userPrincipalName).toLowerCase(),
        status: u.accountEnabled ? "active" : "blocked",
        licenses: (u.assignedLicenses || []).map((lic) => skuMap.get(lic.skuId) || lic.skuId),
        syncedFromGraph: true,
        lastSyncedAt: now,
      });
    }
    next = page["@odata.nextLink"];
  }
  return users;
}

type GraphGroupsPage = {
  value: Array<{ id: string; displayName?: string; groupTypes?: string[]; securityEnabled?: boolean }>;
  "@odata.nextLink"?: string;
};

export async function syncDirectoryGroups(accessToken: string) {
  const groups: Array<{ id: string; name: string; type: string; members: number; source: "graph" }> = [];
  let next: string | undefined = "https://graph.microsoft.com/v1.0/groups?$select=id,displayName,groupTypes,securityEnabled&$top=999";
  while (next) {
    const page: GraphGroupsPage = await graphGet<GraphGroupsPage>(accessToken, next);
    for (const g of page.value) {
      groups.push({
        id: g.id,
        name: g.displayName || g.id,
        type: g.groupTypes?.includes("Unified") ? "Microsoft365" : g.securityEnabled ? "Security" : "Distribution",
        members: 0,
        source: "graph",
      });
    }
    next = page["@odata.nextLink"];
  }
  return groups;
}

function mapServiceStatus(status?: string): "Healthy" | "Advisory" | "Incident" {
  const s = (status || "").toLowerCase();
  if (s.includes("restor") || s.includes("investigat") || s.includes("warning") || s.includes("advisory") || s.includes("degraded")) {
    return "Advisory";
  }
  if (s.includes("incident") || s.includes("outage") || s.includes("interruption") || s === "serviceunhealthy") {
    return "Incident";
  }
  return "Healthy";
}

export async function fetchServiceHealth(accessToken: string) {
  const data = await graphGet<{
    value?: Array<{ id?: string; service?: string; status?: string }>;
  }>(accessToken, "https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/healthOverviews");
  return (data.value || []).map((row) => ({
    service: row.service || row.id || "Unknown",
    status: mapServiceStatus(row.status),
    detail: row.status,
    source: "graph" as const,
  }));
}

export async function fetchSecureScore(accessToken: string) {
  const data = await graphGet<{
    value?: Array<{
      currentScore?: number;
      maxScore?: number;
      enabledServices?: string[];
      averageComparativeScores?: Array<{ basis?: string; averageScore?: number }>;
    }>;
  }>(accessToken, "https://graph.microsoft.com/v1.0/security/secureScores?$top=1");
  const row = data.value?.[0];
  if (!row) {
    return {
      secureScore: 0,
      maxScore: 0,
      mfaCoverage: 0,
      source: "graph" as const,
      recommendations: [{ severity: "INFO", text: "Graph returned no Secure Score records for this tenant." }],
    };
  }
  const current = Math.round(row.currentScore || 0);
  const max = Math.round(row.maxScore || 0);
  const pct = max > 0 ? Math.round((current / max) * 100) : current;
  return {
    secureScore: pct,
    maxScore: max,
    currentScore: current,
    mfaCoverage: 0,
    privilegedUsers: 0,
    riskyUsers: 0,
    disabledUsers: 0,
    staleAccounts: 0,
    guestAccounts: 0,
    legacyAuth: 0,
    adminMfa: 0,
    source: "graph" as const,
    recommendations: [
      {
        severity: "INFO",
        text: `Microsoft Secure Score ${current}/${max} (${pct}%). MFA coverage requires Graph identity reports.`,
      },
    ],
  };
}
