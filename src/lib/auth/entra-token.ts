import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type VerifiedEntraClaims = JWTPayload & {
  oid?: string;
  tid?: string;
  preferred_username?: string;
  email?: string;
  upn?: string;
  name?: string;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksForTenant(tenantId: string) {
  const tid = tenantId || "common";
  if (!jwksCache.has(tid)) {
    jwksCache.set(
      tid,
      createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tid}/discovery/v2.0/keys`))
    );
  }
  return jwksCache.get(tid)!;
}

function acceptedAudiences(): string[] {
  return [
    "https://graph.microsoft.com",
    "00000003-0000-0000-c000-000000000000",
    process.env.AZURE_AD_API_AUDIENCE || "",
    process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID || "",
  ].filter((v) => v && v !== "00000000-0000-0000-0000-000000000000");
}

/**
 * Cryptographically verify a Microsoft Entra access or ID token.
 * Never trust an unsigned JWT payload.
 */
export async function verifyEntraJwt(token: string): Promise<VerifiedEntraClaims | null> {
  const audiences = acceptedAudiences();
  if (!audiences.length) return null;
  const tenantHint = process.env.AZURE_AD_TENANT_ID || "common";
  const tenants = tenantHint === "common" || tenantHint === "organizations" ? [tenantHint, "common"] : [tenantHint, "common"];
  for (const tid of tenants) {
    try {
      const { payload } = await jwtVerify(token, jwksForTenant(tid), { audience: audiences });
      const iss = String(payload.iss || "");
      if (!/^https:\/\/login\.microsoftonline\.com\/[0-9a-fA-F-]+\/v2\.0$/i.test(iss)) {
        continue;
      }
      return payload as VerifiedEntraClaims;
    } catch {
      continue;
    }
  }
  return null;
}
