/**
 * Secure Application Model scaffolding — no live Partner Center calls in Phase 1.
 * Secrets belong in Azure Key Vault, never in env for production.
 */

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
  return {
    mode,
    keyVaultConfigured: Boolean(vault),
    certificateName: process.env.PARTNER_CERT_NAME || "partner-center-cert",
    tokenEncryptionKeyName:
      process.env.TOKEN_ENCRYPTION_KEY_NAME || "token-encryption-key",
    partnerCenterWritesEnabled: false,
    authStrategy:
      "Per-operation App+User (GDAP consent) or partner app credentials with certificates — not universal app-only+GDAP",
    components: [
      {
        component: "key_vault",
        status: vault ? "healthy" : "not_configured",
        detail: vault ? "URI set" : "Set AZURE_KEY_VAULT_URI",
      },
      {
        component: "partner_center",
        status: "not_configured",
        detail: "Read-only sync is Phase 2; writes disabled",
      },
      {
        component: "microsoft_graph",
        status: "not_configured",
        detail: "Delta sync is Phase 2",
      },
      {
        component: "secure_application_model",
        status: vault ? "degraded" : "not_configured",
        detail: "Certificate-based token acquire/refresh pending Phase 2",
      },
    ],
  };
}

/** Placeholder for encrypted refresh token persistence */
export async function storeEncryptedRefreshToken(_params: {
  partnerUserId: string;
  ciphertext: string;
}): Promise<{ ok: true; storage: "key_vault_stub" }> {
  return { ok: true, storage: "key_vault_stub" };
}

export async function acquirePartnerTokenStub(): Promise<{
  ok: false;
  code: string;
  message: string;
}> {
  return {
    ok: false,
    code: "SAM_NOT_CONFIGURED",
    message:
      "Secure Application Model token acquisition requires Key Vault certificate (Phase 2).",
  };
}
