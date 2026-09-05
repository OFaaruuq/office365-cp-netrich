import type { Configuration, PopupRequest } from "@azure/msal-browser";

/**
 * Azure AD / Entra ID app registration for office365.cp.netrichtechnologies.com
 *
 * Register an app in Microsoft Entra ID (Partner Center / CSP tenant):
 * - Redirect URI: https://office365.cp.netrichtechnologies.com
 * - SPA redirect: https://office365.cp.netrichtechnologies.com
 * - API permissions (delegated): User.Read.All, Directory.Read.All,
 *   Organization.Read.All, LicenseAssignment.ReadWrite.All
 * - For CSP license commerce: Partner Center APIs + Graph subscribedSkus
 */
export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID || "00000000-0000-0000-0000-000000000000",
    authority:
      process.env.NEXT_PUBLIC_AZURE_AD_AUTHORITY ||
      "https://login.microsoftonline.com/common",
    redirectUri:
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    postLogoutRedirectUri:
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  },
  cache: {
    cacheLocation: "localStorage",
  },
};

export const loginRequest: PopupRequest = {
  scopes: [
    "User.Read",
    "User.Read.All",
    "Directory.Read.All",
    "Organization.Read.All",
    "Directory.AccessAsUser.All",
  ],
};

export const graphConfig = {
  graphMeEndpoint: "https://graph.microsoft.com/v1.0/me",
  graphUsersEndpoint: "https://graph.microsoft.com/v1.0/users",
  graphSubscribedSkus: "https://graph.microsoft.com/v1.0/subscribedSkus",
  graphOrgEndpoint: "https://graph.microsoft.com/v1.0/organization",
};
