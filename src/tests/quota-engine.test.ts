import { describe, expect, it } from "vitest";

import { evaluateQuota } from "../services/quota-engine";

const account = {
  monthlyAllowance: 1000,
  maxPerRequest: 100,
  consumedUnits: 900,
};

const user = {
  monthlyAllowance: 400,
  maxPerRequest: 30,
  consumedUnits: 200,
};

describe("Quota Engine", () => {
  it("accepts a request within all limits", () => {
    const result = evaluateQuota(20, account, user);

    expect(result.accepted).toBe(true);
    expect(result.rejection).toBeNull();
    expect(result.accountRemaining).toBe(80);
    expect(result.userRemaining).toBe(180);
  });

  it("rejects a request above user max per request", () => {
    const result = evaluateQuota(35, account, user);

    expect(result.accepted).toBe(false);
    expect(result.rejection).toEqual({
      level: "user",
      rule: "MAX_PER_REQUEST",
    });
  });

  it("rejects a request above account monthly remaining", () => {
    const limitedAccount = {
      ...account,
      consumedUnits: 995,
    };

    const result = evaluateQuota(
      10,
      limitedAccount,
      user
    );

    expect(result.accepted).toBe(false);
    expect(result.rejection).toEqual({
      level: "account",
      rule: "MONTHLY_ALLOWANCE",
    });
  });

  it("rejects a request above user monthly remaining", () => {
    const limitedUser = {
      ...user,
      consumedUnits: 395,
    };

    const result = evaluateQuota(
      10,
      account,
      limitedUser
    );

    expect(result.accepted).toBe(false);
    expect(result.rejection).toEqual({
      level: "user",
      rule: "MONTHLY_ALLOWANCE",
    });
  });

  it("shows zero remaining after reducing the monthly limit", () => {
    const reducedUser = {
      ...user,
      monthlyAllowance: 100,
      consumedUnits: 200,
    };

    const result = evaluateQuota(
      10,
      account,
      reducedUser
    );

    expect(result.accepted).toBe(false);
    expect(result.userRemaining).toBe(0);
  });

  it("rejects non-positive units", () => {
    expect(() => evaluateQuota(0, account, user)).toThrow();
  });
});