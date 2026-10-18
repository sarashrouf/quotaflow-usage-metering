import type {
  QuotaState,
  QuotaDecision,
  QuotaRejection,
} from "../types/quota.types";

// Remaining allowance cannot be negative.
export function getRemaining(quota: QuotaState): number {
  return Math.max(
    0,
    quota.monthlyAllowance - quota.consumedUnits
  );
}

// Evaluate both account and user quotas without
// reading from or writing to the database.
export function evaluateQuota(
  units: number,
  account: QuotaState,
  user: QuotaState
): QuotaDecision {
  if (!Number.isSafeInteger(units) || units <= 0) {
    throw new Error("Units must be a positive safe integer.");
  }

  const accountRemaining = getRemaining(account);
  const userRemaining = getRemaining(user);

  let rejection: QuotaRejection | null = null;

  // A request must satisfy every rule.
  // The order determines which reason is reported first.
  if (units > account.maxPerRequest) {
    rejection = {
      level: "account",
      rule: "MAX_PER_REQUEST",
    };
  } else if (units > user.maxPerRequest) {
    rejection = {
      level: "user",
      rule: "MAX_PER_REQUEST",
    };
  } else if (units > accountRemaining) {
    rejection = {
      level: "account",
      rule: "MONTHLY_ALLOWANCE",
    };
  } else if (units > userRemaining) {
    rejection = {
      level: "user",
      rule: "MONTHLY_ALLOWANCE",
    };
  }

  const accepted = rejection === null;

  return {
    accepted,
    rejection,

    // Return the expected remaining allowance
    // after this request's decision.
    accountRemaining: accepted
      ? accountRemaining - units
      : accountRemaining,

    userRemaining: accepted
      ? userRemaining - units
      : userRemaining,
  };
}