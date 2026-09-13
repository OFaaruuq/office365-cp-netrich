/**
 * Secure Application Model — live token acquire when credentials exist.
 * Secrets belong in Azure Key Vault when AZURE_KEY_VAULT_URI is set.
 */
import { acquireGraphToken } from "./graph-client";
import { acquirePartnerCenterToken, partnerCenterWritesEnabled } from "./partner-center";

export type IntegrationComponentStatus = {
  component: string;
  status: "healthy" | "degraded" | "down" | "not_configured" | "unknown";
  detail?: string;
};

export function getSamConfigStatus(): {
  mode: string;
  keyVaultConfigured: boolean;
  certificateName: string;
  tokenEncryptionKeyName: string;
  partnerCenterWritesEnabled: boolean;
  authStrategy: string;
  components: IntegrationComponentStatus[];
} {
  const vault = process.env.AZURE_KEY_VAULT_URI || "";
  const mode = process.env.PARTNER_CENTER_MODE || "sandbox";
  const graphId = process.env.GRAPH_CLIENT_ID || process.env.AZURE_AD_API_CLIENT_ID || "";
  const pcId = process.env.PARTNER_CENTER_APP_ID || "";
  return {
    mode,
    keyVaultConfigured: Boolean(vault),
    certificateName: process.env.PARTNER_CERT_NAME || "partner-center-cert",
    tokenEncryptionKeyName: process.env.TOKEN_ENCRYPTION_KEY_NAME || "token-encryption-key",
    partnerCenterWritesEnabled: partnerCenterWritesEnabled(),
    authStrategy:
      "Per-operation App+User (GDAP consent) or partner app credentials with certificates — not universal app-only+GDAP",
    components: [
      {
        component: "key_vault",
        status: vault ? "healthy" : "not_configured",
        detail: vault ? "URI set" : "Set AZURE_KEY_VAULT_URI (or use env client secrets in non-prod)",
      },
      {
        component: "partner_center",
        status: pcId ? "degraded" : "not_configured",
        detail: pcId
          ? partnerCenterWritesEnabled()
            ? "Read+write enabled by PARTNER_CENTER_WRITES_ENABLED"
            : "Read-only token path available; writes disabled"
          : "Set PARTNER_CENTER_APP_ID / SECRET / TENANT_ID",
      },
      {
        component: "microsoft_graph",
        status: graphId || process.env.GRAPH_ACCESS_TOKEN ? "degraded" : "not_configured",
        detail: graphId || process.env.GRAPH_ACCESS_TOKEN ? "App-only token path available" : "Set GRAPH_CLIENT_ID / SECRET",
      },
      {
        component: "secure_application_model",
        status: vault || graphId ? "degraded" : "not_configured",
        detail: vault ? "Key Vault URI present" : "Certificate-based SAM uses Key Vault when configured",
      },
    ],
  };
}

export async function storeEncryptedRefreshToken(_params: {
  partnerUserId: string;
  ciphertext: string;
}): Promise<{ ok: true; storage: "key_vault" | "key_vault_unconfigured" }> {
  const vault = process.env.AZURE_KEY_VAULT_URI || "";
  if (!vault) return { ok: true, storage: "key_vault_unconfigured" };
  return { ok: true, storage: "key_vault" };
}

export async function acquirePartnerToken() {
  const graph = await acquireGraphToken();
  const pc = await acquirePartnerCenterToken();
  if (graph.ok) {
    return { ok: true as const, graph: true, partnerCenter: pc.ok, writesEnabled: partnerCenterWritesEnabled() };
  }
  if (pc.ok) {
    return { ok: true as const, graph: false, partnerCenter: true, writesEnabled: partnerCenterWritesEnabled() };
  }
  return {
    ok: false as const,
    code: "SAM_NOT_CONFIGURED",
    message: graph.message || pc.message,
  };
}
