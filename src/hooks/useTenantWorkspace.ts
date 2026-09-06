"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { portalFetch } from "@/lib/admin-api";
import { useInspectCustomer } from "@/hooks/useInspectCustomer";
import type {
  CostSummary,
  PortalUser,
  ProductRecommendation,
  RenewalItem,
  Subscription,
  UserRollup,
} from "@/lib/types";

export type TenantWorkspaceState = {
  customerId: string;
  domain: string;
  name?: string;
  users: PortalUser[];
  userRollup: UserRollup;
  subscriptions: Subscription[];
  costSummary: CostSummary;
  renewals: RenewalItem[];
  recommendations: ProductRecommendation[];
  allowedCatalogs: string[];
  securityPosture?: {
    mfaPercent: number;
    threatEvents30d: number;
    secureScore: number;
    lastAssessedAt: string;
  };
  solutions?: {
    collaboration: {
      teamsActiveUsers: number;
      sharePointSites: number;
      meetings30d: number;
    };
    emailData: {
      mailboxes: number;
      oneDriveGB: number;
      sharePointGB: number;
    };
  };
};

type State = {
  loading: boolean;
  error: string | null;
  workspace: TenantWorkspaceState | null;
  needsCustomerPick: boolean;
};

export function useTenantWorkspace(explicitCustomerId?: string | null) {
  const { user, isClient, isPartner, ready } = useSession();
  const inspect = useInspectCustomer();
  const [state, setState] = useState<State>({
    loading: true,
    error: null,
    workspace: null,
    needsCustomerPick: false,
  });

  const load = useCallback(async () => {
    if (!ready || !user || !inspect.ready) {
      setState({ loading: false, error: null, workspace: null, needsCustomerPick: false });
      return;
    }

    const customerId = explicitCustomerId || inspect.customerId;

    if (isPartner && !customerId) {
      setState({
        loading: false,
        error: null,
        workspace: null,
        needsCustomerPick: true,
      });
      return;
    }

    if (!customerId) {
      setState({
        loading: false,
        error: "No tenant bound to this session.",
        workspace: null,
        needsCustomerPick: false,
      });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const qs = isPartner ? `?customerId=${encodeURIComponent(customerId)}` : "";
      const res = await portalFetch(`/api/me/workspace${qs}`);
      const data = await res.json();
      if (!res.ok) {
        setState({
          loading: false,
          error: data.error || "Failed to load tenant workspace",
          workspace: null,
          needsCustomerPick: data.code === "CUSTOMER_REQUIRED",
        });
        return;
      }
      setState({
        loading: false,
        error: null,
        needsCustomerPick: false,
        workspace: data.workspace as TenantWorkspaceState,
      });
    } catch {
      setState({
        loading: false,
        error: "Unable to load isolated tenant data.",
        workspace: null,
        needsCustomerPick: false,
      });
    }
  }, [ready, user, isClient, isPartner, explicitCustomerId, inspect.ready, inspect.customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    ...state,
    reload: load,
    isPartner,
    isClient,
    user,
    inspectCustomerId: inspect.customerId,
    inspectCustomerName: inspect.customerName,
  };
}
