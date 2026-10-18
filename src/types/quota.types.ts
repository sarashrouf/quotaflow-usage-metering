// Identifies which plan prevented consumption.
export type QuotaLevel = "account" | "user";

// The supported business rules.
export type QuotaRule =
  | "MAX_PER_REQUEST"
  | "MONTHLY_ALLOWANCE";

// A snapshot of the limits and current usage.
export interface QuotaState {
  monthlyAllowance: number;
  maxPerRequest: number;
  consumedUnits: number;
}

// A rejected request must explain which rule failed.
export interface QuotaRejection {
  level: QuotaLevel;
  rule: QuotaRule;
}

// Result of evaluating a consumption request.
export interface QuotaDecision {
  accepted: boolean;
  rejection: QuotaRejection | null;
  accountRemaining: number;
  userRemaining: number;
}