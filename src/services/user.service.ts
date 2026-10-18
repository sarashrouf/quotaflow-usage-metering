import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../db/connection";
import { users, plans } from "../db/schema";
import { hasDatabaseErrorCode } from "../utils/database-errors";
export class UserPlanNotFoundError extends Error {
  constructor() {
    super("User plan not found or unavailable.");
    this.name = "UserPlanNotFoundError";
  }
}

export class DuplicateUserError extends Error {
  constructor() {
    super("A user with this external ID already exists.");
    this.name = "DuplicateUserError";
  }
}

interface CreateUserInput {
  externalId: string;
  planCode: string;
}

export async function createUser(
  accountId: string,
  input: CreateUserInput
) {
  // Find a user plan that this account is permitted to assign.
  const [selectedPlan] = await db
    .select({
      id: plans.id,
      code: plans.code,
      name: plans.name,
    })
    .from(plans)
    .where(
      and(
        eq(plans.code, input.planCode),
        eq(plans.type, "user"),
        or(
          and(
            eq(plans.isSystem, true),
            isNull(plans.ownerAccountId)
          ),
          and(
            eq(plans.isSystem, false),
            eq(plans.ownerAccountId, accountId)
          )
        )
      )
    )
    .limit(1);

  if (!selectedPlan) {
    throw new UserPlanNotFoundError();
  }

  try {
    const [newUser] = await db
      .insert(users)
      .values({
        accountId,
        externalId: input.externalId,
        planId: selectedPlan.id,
      })
      .returning({
        id: users.id,
        externalId: users.externalId,
        createdAt: users.createdAt,
      });

    if (!newUser) {
      throw new Error("Failed to create user.");
    }

    return {
      ...newUser,
      plan: {
        code: selectedPlan.code,
        name: selectedPlan.name,
      },
    };
  }  catch (error) {
  if (hasDatabaseErrorCode(error, "23505")) {
    throw new DuplicateUserError();
  }

  throw error;
}
}

export async function listUsers(accountId: string) {
  return db
    .select({
      id: users.id,
      externalId: users.externalId,
      createdAt: users.createdAt,
      planCode: plans.code,
      planName: plans.name,
      monthlyAllowance: plans.monthlyAllowance,
      maxPerRequest: plans.maxPerRequest,
    })
    .from(users)
    .innerJoin(plans, eq(users.planId, plans.id))
    .where(eq(users.accountId, accountId))
    .orderBy(users.createdAt, users.id);
}