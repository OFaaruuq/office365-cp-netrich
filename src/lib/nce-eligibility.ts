/**
 * New Commerce Experience eligibility (local engine).
 * Partner Center remains the authority once live; this blocks UI actions Microsoft would reject.
 * @see https://learn.microsoft.com/en-us/partner-center/customers/create-a-new-subscription
 */

export type NceAction =
  | "purchase"
  | "increase_seats"
  | "decrease_seats"
  | "cancel"
  | "schedule_change"
  | "convert_trial";

export type NceDecision = {
  allowed: boolean;
  code: string;
  reason: string;
  windows?: { cancelHoursRemaining?: number };
};

const CANCEL_WINDOW_MS = 168 * 60 * 60 * 1000;

export function nceEligibility(input: {
  action: NceAction;
  catalog?: string;
  billingCycle?: string;
  quantity?: number;
  currentQuantity?: number;
  termStartAt?: string;
  partnerCenterWritesEnabled?: boolean;
}): NceDecision {
  if (input.catalog === "azure" && (input.action === "increase_seats" || input.action === "decrease_seats")) {
    return {
      allowed: false,
      code: "AZURE_NOT_SEAT_BASED",
      reason: "Azure is a consumption / Azure plan domain, not Microsoft 365 seat SKUs.",
    };
  }

  if (input.action === "purchase") {
    if ((input.quantity || 0) < 1) {
      return { allowed: false, code: "INVALID_QTY", reason: "Quantity must be at least 1." };
    }
    return { allowed: true, code: "OK", reason: "Purchase eligible (local NCE rules)." };
  }

  if (input.action === "increase_seats") {
    return { allowed: true, code: "OK", reason: "Seat increases are allowed mid-term under NCE." };
  }

  if (input.action === "decrease_seats") {
    return {
      allowed: false,
      code: "SCHEDULE_AT_TERM_END",
      reason: "Mid-term seat reductions must be scheduled for the next term end (NCE scheduled changes).",
    };
  }

  if (input.action === "cancel") {
    const start = input.termStartAt ? new Date(input.termStartAt).getTime() : NaN;
    if (!Number.isFinite(start)) {
      return {
        allowed: false,
        code: "UNKNOWN_TERM_START",
        reason: "Cancel window cannot be evaluated without a term start date.",
      };
    }
    const remaining = CANCEL_WINDOW_MS - (Date.now() - start);
    if (remaining <= 0) {
      return {
        allowed: false,
        code: "CANCEL_WINDOW_CLOSED",
        reason: "The 168-hour NCE cancel window has closed. Schedule cancellation at term end.",
        windows: { cancelHoursRemaining: 0 },
      };
    }
    return {
      allowed: true,
      code: "OK",
      reason: "Within the 168-hour NCE cancel window.",
      windows: { cancelHoursRemaining: Math.ceil(remaining / 36e5) },
    };
  }

  if (input.action === "schedule_change") {
    return { allowed: true, code: "OK", reason: "Scheduled changes are allowed at term end." };
  }

  return { allowed: false, code: "UNSUPPORTED_ACTION", reason: `Action ${input.action} is not supported.` };
}

export function partnerCenterWriteGuard(writesEnabled: boolean): NceDecision | null {
  if (writesEnabled) return null;
  return {
    allowed: false,
    code: "PC_WRITES_DISABLED",
    reason:
      "Partner Center commerce writes stay disabled until Graph + Partner Center read-only sync is healthy. Local orders remain the SoR.",
  };
}
