import { and, eq, isNull, or } from "drizzle-orm";
import { hasDatabaseErrorCode } from "../utils/database-errors";
import { db } from "../db/connection";
import { accounts, plans, users, accountPlanAssignments } from "../db/schema";

export class PlanNotFoundError extends Error {
  constructor() {
    super("Plan not found or not accessible.");
    this.name = "PlanNotFoundError";
  }
}

export class PlanNotEditableError extends Error {
  constructor() {
    super("This plan cannot be edited.");
    this.name = "PlanNotEditableError";
  }
}

export class PlanCodeConflictError extends Error {
  constructor() {
    super("A plan with this code already exists.");
    this.name = "PlanCodeConflictError";
  }
}

export type PlanType = "account" | "user";

export interface CreatePlanInput {
  code: string;
  name: string;
  type: PlanType;
  monthlyAllowance: number;
  maxPerRequest: number;
}

export interface UpdatePlanInput {
  name?: string;
  monthlyAllowance?: number;
  maxPerRequest?: number;
}


export async function listAvailablePlans(accountId: string) {
  return db
    .select({
      id: plans.id,
      code: plans.code,
      name: plans.name,
      type: plans.type,
      monthlyAllowance: plans.monthlyAllowance,
      maxPerRequest: plans.maxPerRequest,
      isSystem: plans.isSystem,
    })
    .from(plans)
    .where(
      or(
        and(
          eq(plans.isSystem, true),
          isNull(plans.ownerAccountId)
        ),
        eq(plans.ownerAccountId, accountId)
      )
    )
    .orderBy(plans.type, plans.name);
}

export async function createCustomPlan(
  accountId: string,
  input: CreatePlanInput
) {
  try {
    const [createdPlan] = await db
      .insert(plans)
      .values({
        ...input,
        isSystem: false,
        ownerAccountId: accountId,
      })
      .returning();

    if (!createdPlan) {
      throw new Error("Failed to create plan.");
    }

    return createdPlan;
  } catch (error) {
    if (hasDatabaseErrorCode(error, "23505")) {
      throw new PlanCodeConflictError();
    }

    throw error;
  }
}


export async function updateCustomPlan(
  accountId: string,
  planId: string,
  input: UpdatePlanInput
) {
  return db.transaction(async (tx) => {
    // Follow the same locking protocol as consumption.
    await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .for("update");

    const [updatedPlan] = await tx
      .update(plans)
      .set(input)
      .where(
        and(
          eq(plans.id, planId),
          eq(plans.ownerAccountId, accountId),
          eq(plans.isSystem, false)
        )
      )
      .returning();

    if (!updatedPlan) {
      throw new PlanNotFoundError();
    }

    return updatedPlan;
  });
}

export async function changeUserPlan(
  accountId: string,
  userId: string,
  planId: string
) {
  return db.transaction(async (tx) => {
    // Serialize plan assignments with quota consumption.
    await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .for("update");

    const [selectedPlan] = await tx
      .select({
        id: plans.id,
        name: plans.name,
        code: plans.code,
      })
      .from(plans)
      .where(
        and(
          eq(plans.id, planId),
          eq(plans.type, "user"),
          or(
            and(
              eq(plans.isSystem, true),
              isNull(plans.ownerAccountId)
            ),
            eq(plans.ownerAccountId, accountId)
          )
        )
      );

    if (!selectedPlan) {
      throw new PlanNotFoundError();
    }

    const [updatedUser] = await tx
      .update(users)
      .set({ planId: selectedPlan.id })
      .where(
        and(
          eq(users.id, userId),
          eq(users.accountId, accountId)
        )
      )
      .returning({
        id: users.id,
        externalId: users.externalId,
      });

    if (!updatedUser) {
      throw new PlanNotFoundError();
    }

    return {
      ...updatedUser,
      plan: selectedPlan,
    };
  });
}


export async function changeAccountPlan(
  accountId: string,
  planId: string
) {
  return db.transaction(async (tx) => {
    // Ensure quota requests and plan changes have a defined order.
    await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .for("update");

    const [selectedPlan] = await tx
      .select({
        id: plans.id,
        code: plans.code,
        name: plans.name,
      })
      .from(plans)
      .where(
        and(
          eq(plans.id, planId),
          eq(plans.type, "account"),
          or(
            and(
              eq(plans.isSystem, true),
              isNull(plans.ownerAccountId)
            ),
            eq(plans.ownerAccountId, accountId)
          )
        )
      );

    if (!selectedPlan) {
      throw new PlanNotFoundError();
    }

    const [assignment] = await tx
      .update(accountPlanAssignments)
      .set({
        planId: selectedPlan.id,
        assignedAt: new Date(),
      })
      .where(
        eq(accountPlanAssignments.accountId, accountId)
      )
      .returning({
        accountId: accountPlanAssignments.accountId,
      });

    if (!assignment) {
      throw new Error("Account plan assignment is missing.");
    }

    return {
      accountId,
      plan: selectedPlan,
    };
  });
}