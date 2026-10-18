import { and, eq, sql } from "drizzle-orm";

import { db } from "../db/connection";
import { currentTime, getUtcMonth} from "../utils/clock";
import {
  accounts,
  plans,
  users,
  accountPlanAssignments,
  accountUsage,
  userUsage,
  requestHistory,
} from "../db/schema";

import { evaluateQuota } from "./quota-engine";

export class UserNotFoundError extends Error {
  constructor() {
    super("User not found in this account.");
    this.name = "UserNotFoundError";
  }
}

export class RequestIdConflictError extends Error {
  constructor() {
    super("Request ID was already used with different data.");
    this.name = "RequestIdConflictError";
  }
}

interface ConsumeInput {
  requestId: string;
  userId: string;
  units: number;
}

export async function consumeUnits(
  accountId: string,
  input: ConsumeInput
) {
  return db.transaction(async (tx) => {
    // 1. Serialize all quota-changing operations for this account.
    const [lockedAccount] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .for("update");

    if (!lockedAccount) {
      throw new Error("Authenticated account no longer exists.");
    }

    // 2. Check idempotency AFTER acquiring the account lock.
    const [previousRequest] = await tx
      .select()
      .from(requestHistory)
      .where(
        and(
          eq(requestHistory.accountId, accountId),
          eq(requestHistory.requestId, input.requestId)
        )
      )
      .limit(1);

    if (previousRequest) {
      if (
        previousRequest.userId !== input.userId ||
        previousRequest.requestedUnits !== input.units
      ) {
        throw new RequestIdConflictError();
      }

      return {
        requestId: previousRequest.requestId,
        userId: previousRequest.userId,
        units: previousRequest.requestedUnits,
        status: previousRequest.status,
        rejectionLevel: previousRequest.rejectionLevel,
        rejectionRule: previousRequest.rejectionRule,
        processedAt: previousRequest.processedAt,
        replayed: true,
      };
    }

    // 3. Find the user's current plan within this account.
    const [currentUser] = await tx
      .select({
        id: users.id,
        monthlyAllowance: plans.monthlyAllowance,
        maxPerRequest: plans.maxPerRequest,
      })
      .from(users)
      .innerJoin(plans, eq(users.planId, plans.id))
      .where(
        and(
          eq(users.id, input.userId),
          eq(users.accountId, accountId)
        )
      )
      .limit(1);

    if (!currentUser) {
      throw new UserNotFoundError();
    }

    // 4. Find the company's current plan.
    const [accountPlan] = await tx
      .select({
        monthlyAllowance: plans.monthlyAllowance,
        maxPerRequest: plans.maxPerRequest,
      })
      .from(accountPlanAssignments)
      .innerJoin(
        plans,
        eq(accountPlanAssignments.planId, plans.id)
      )
      .where(
        eq(accountPlanAssignments.accountId, accountId)
      )
      .limit(1);

    if (!accountPlan) {
      throw new Error("Account plan assignment is missing.");
    }

    // 5. Calculate the current UTC billing month.
    const processedAt = currentTime();
    const month = getUtcMonth(processedAt);

    // 6. Read the company's consumption for this month.
    const [accountCounter] = await tx
      .select({
        consumedUnits: accountUsage.consumedUnits,
      })
      .from(accountUsage)
      .where(
        and(
          eq(accountUsage.accountId, accountId),
          eq(accountUsage.month, month)
        )
      )
      .limit(1);

    // 7. Read the user's consumption for this month.
    const [userCounter] = await tx
      .select({
        consumedUnits: userUsage.consumedUnits,
      })
      .from(userUsage)
      .where(
        and(
          eq(userUsage.userId, input.userId),
          eq(userUsage.month, month)
        )
      )
      .limit(1);

    // Missing row means no previous consumption this month.
    const accountConsumed = accountCounter?.consumedUnits ?? 0;
    const userConsumed = userCounter?.consumedUnits ?? 0;

    // 8. Let the pure quota engine make the decision.
    const decision = evaluateQuota(
      input.units,
      {
        monthlyAllowance: accountPlan.monthlyAllowance,
        maxPerRequest: accountPlan.maxPerRequest,
        consumedUnits: accountConsumed,
      },
      {
        monthlyAllowance: currentUser.monthlyAllowance,
        maxPerRequest: currentUser.maxPerRequest,
        consumedUnits: userConsumed,
      }
    );

    // 9. Update both counters ONLY when accepted.
    if (decision.accepted) {
      await tx
        .insert(accountUsage)
        .values({
          accountId,
          month,
          consumedUnits: input.units,
        })
        .onConflictDoUpdate({
          target: [accountUsage.accountId, accountUsage.month],
          set: {
            consumedUnits: sql`${accountUsage.consumedUnits} + ${input.units}`,
          },
        });

      await tx
        .insert(userUsage)
        .values({
          accountId,
          userId: input.userId,
          month,
          consumedUnits: input.units,
        })
        .onConflictDoUpdate({
          target: [userUsage.userId, userUsage.month],
          set: {
            consumedUnits: sql`${userUsage.consumedUnits} + ${input.units}`,
          },
        });
    }

    // 10. Save every decision, including rejected requests.
    const [history] = await tx
      .insert(requestHistory)
      .values({
        accountId,
        userId: input.userId,
        requestId: input.requestId,
        requestedUnits: input.units,
        status: decision.accepted ? "accepted" : "rejected",
        rejectionLevel: decision.rejection?.level ?? null,
        rejectionRule: decision.rejection?.rule ?? null,
        processedAt,
      })
      .returning({
        processedAt: requestHistory.processedAt,
      });

    return {
      requestId: input.requestId,
      userId: input.userId,
      units: input.units,
      status: decision.accepted ? "accepted" : "rejected",
      rejectionLevel: decision.rejection?.level ?? null,
      rejectionRule: decision.rejection?.rule ?? null,
      accountRemaining: decision.accountRemaining,
      userRemaining: decision.userRemaining,
      processedAt: history.processedAt,
      replayed: false,
    };
  });
}