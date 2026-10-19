import { and, eq } from "drizzle-orm";

import { db } from "../db/connection";
import { currentTime, getUtcMonth } from "../utils/clock";
import {
  accounts,
  plans,
  users,
  accountPlanAssignments,
  accountUsage,
  userUsage,
} from "../db/schema";

// A calendar month is identified by its first UTC day.


function remainingAllowance(
  allowance: number,
  consumed: number
): number {
  return Math.max(0, allowance - consumed);
}
export async function getUsageOverview(
  accountId: string,
  requestedMonth?: string
) {
  const month = requestedMonth
    ? getUtcMonth(new Date(`${requestedMonth}-01T00:00:00.000Z`))
    : getUtcMonth(currentTime());
  // 1. Read the company's assigned plan and monthly usage.
  const [accountResult] = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      planCode: plans.code,
      monthlyAllowance: plans.monthlyAllowance,
      maxPerRequest: plans.maxPerRequest,
      consumedUnits: accountUsage.consumedUnits,
    })
    .from(accounts)
    .innerJoin(
      accountPlanAssignments,
      eq(accountPlanAssignments.accountId, accounts.id)
    )
    .innerJoin(
      plans,
      eq(plans.id, accountPlanAssignments.planId)
    )
    .leftJoin(
      accountUsage,
      and(
        eq(accountUsage.accountId, accounts.id),
        eq(accountUsage.month, month)
      )
    )
    .where(eq(accounts.id, accountId));

  if (!accountResult) {
    throw new Error("Account or plan assignment not found.");
  }

  const accountConsumed = accountResult.consumedUnits ?? 0;

  // 2. Read only users belonging to the authenticated account.
  const userResults = await db
    .select({
      id: users.id,
      externalId: users.externalId,
      planCode: plans.code,
      monthlyAllowance: plans.monthlyAllowance,
      maxPerRequest: plans.maxPerRequest,
      consumedUnits: userUsage.consumedUnits,
    })
    .from(users)
    .innerJoin(plans, eq(users.planId, plans.id))
    .leftJoin(
      userUsage,
      and(
        eq(userUsage.userId, users.id),
        eq(userUsage.month, month)
      )
    )
    .where(eq(users.accountId, accountId))
    .orderBy(users.externalId);

  return {
    month,
    account: {
      id: accountResult.id,
      name: accountResult.name,
      planCode: accountResult.planCode,
      monthlyAllowance: accountResult.monthlyAllowance,
      maxPerRequest: accountResult.maxPerRequest,
      consumedUnits: accountConsumed,
      remainingUnits: remainingAllowance(
        accountResult.monthlyAllowance,
        accountConsumed
      ),
    },
    users: userResults.map((user) => {
      const consumed = user.consumedUnits ?? 0;

      return {
        id: user.id,
        externalId: user.externalId,
        planCode: user.planCode,
        monthlyAllowance: user.monthlyAllowance,
        maxPerRequest: user.maxPerRequest,
        consumedUnits: consumed,
        remainingUnits: remainingAllowance(
          user.monthlyAllowance,
          consumed
        ),
      };
    }),
  };
}