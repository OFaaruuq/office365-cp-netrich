import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type EntraClaims = JWTPayload & {
  oid?: string;
  tid?: string;
  preferred_username?: string;
  email?: string;
  name?: string;
  amr?: string[];
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksForTenant(tenantId: string) {
  const tid = tenantId || "common";
  if (!jwksCache.has(tid)) {
    jwksCache.set(
      tid,
      createRemoteJWKSet(
        new URL(`https://login.microsoftonline.com/${tid}/discovery/v2.0/keys`)
      )
    );
  }
  return jwksCache.get(tid)!;
}

/**
 * Validate Microsoft Entra access token.
 * Production: set AZURE_AD_API_AUDIENCE (api://app-id or app id URI).
 * Dev without audience: returns null (caller may fall back to demo session).
 */
export async function validateEntraAccessToken(
  token: string
): Promise<EntraClaims | null> {
  const audience = process.env.AZURE_AD_API_AUDIENCE;
  if (!audience) return null;

  const tenantHint = process.env.AZURE_AD_TENANT_ID || "common";
  try {
    const { payload } = await jwtVerify(token, jwksForTenant(tenantHint), {
      audience,
    });
    const iss = String(payload.iss || "");
    if (
      iss &&
      !/^https:\/\/login\.microsoftonline\.com\/[0-9a-fA-F-]+\/v2\.0$/i.test(iss) &&
      !iss.includes("login.microsoftonline.com")
    ) {
      return null;
    }
    return payload as EntraClaims;
  } catch {
    try {
      const { payload } = await jwtVerify(token, jwksForTenant("common"), {
        audience,
      });
      return payload as EntraClaims;
    } catch {
      return null;
    }
  }
}

export function hasMfaClaim(claims: EntraClaims): boolean {
  const amr = claims.amr || [];
  return amr.some((a) => /mfa|otp|sms|phonelog/i.test(String(a)));
}
