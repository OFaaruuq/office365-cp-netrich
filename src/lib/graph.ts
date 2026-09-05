import { graphConfig } from "./msal-config";
import type { PortalUser, Subscription, UserStatus } from "./types";

export async function callGraph<T>(
  accessToken: string,
  endpoint: string
): Promise<T> {
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Graph API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

interface GraphUser {
  id: string;
  displayName: string;
  mail?: string;
  userPrincipalName: string;
  accountEnabled: boolean;
  assignedLicenses?: { skuId: string }[];
}

interface GraphUsersResponse {
  value: GraphUser[];
  "@odata.nextLink"?: string;
}

interface GraphSku {
  skuId: string;
  skuPartNumber: string;
  prepaidUnits: { enabled: number };
  consumedUnits: number;
  capabilityStatus: string;
}

interface GraphSkusResponse {
  value: GraphSku[];
}

const SKU_LABELS: Record<string, string> = {
  O365_BUSINESS_ESSENTIALS: "Microsoft 365 Business Basic",
  O365_BUSINESS_PREMIUM: "Microsoft 365 Business Standard",
  SPB: "Microsoft 365 Business Premium",
  ENTERPRISEPACK: "Office 365 E3",
  ENTERPRISEPREMIUM: "Office 365 E5",
  EXCHANGESTANDARD: "Exchange Online (Plan 1)",
  EMS: "Enterprise Mobility + Security E3",
  EMSPREMIUM: "Enterprise Mobility + Security E5",
};

function mapUserStatus(user: GraphUser): UserStatus {
  if (!user.accountEnabled) return "blocked";
  return "active";
}

export async function syncUsersFromGraph(
  accessToken: string
): Promise<PortalUser[]> {
  const allUsers: PortalUser[] = [];
  let endpoint: string | undefined = `${graphConfig.graphUsersEndpoint}?$select=id,displayName,mail,userPrincipalName,accountEnabled,assignedLicenses&$top=999`;

  const skus = await callGraph<GraphSkusResponse>(
    accessToken,
    graphConfig.graphSubscribedSkus
  );
  const skuMap = new Map(
    skus.value.map((s) => [s.skuId, SKU_LABELS[s.skuPartNumber] || s.skuPartNumber])
  );

  while (endpoint) {
    const page: GraphUsersResponse = await callGraph<GraphUsersResponse>(
      accessToken,
      endpoint
    );
    const now = new Date().toISOString();

    for (const gu of page.value) {
      const licenses =
        gu.assignedLicenses
          ?.map((l: { skuId: string }) => skuMap.get(l.skuId))
          .filter((x: string | undefined): x is string => Boolean(x)) || [];

      allUsers.push({
        id: gu.id,
        displayName: gu.displayName || gu.userPrincipalName,
        email: gu.mail || gu.userPrincipalName,
        status: mapUserStatus(gu),
        licenses,
        syncedFromGraph: true,
        lastSyncedAt: now,
      });
    }

    const nextLink: string | undefined = page["@odata.nextLink"];
    endpoint = nextLink;
  }

  return allUsers;
}

export async function syncSubscriptionsFromGraph(
  accessToken: string
): Promise<Partial<Subscription>[]> {
  const skus = await callGraph<GraphSkusResponse>(
    accessToken,
    graphConfig.graphSubscribedSkus
  );

  return skus.value
    .filter((s) => s.capabilityStatus === "Enabled")
    .map((s) => {
      const purchased = s.prepaidUnits.enabled;
      const used = s.consumedUnits;
      return {
        id: s.skuId,
        name: SKU_LABELS[s.skuPartNumber] || s.skuPartNumber,
        purchased,
        used,
        available: Math.max(0, purchased - used),
        skuId: s.skuId,
      };
    });
}

export async function getMe(accessToken: string) {
  return callGraph<{
    displayName: string;
    mail?: string;
    userPrincipalName: string;
  }>(accessToken, graphConfig.graphMeEndpoint);
}
