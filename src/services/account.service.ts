import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/connection";

import {
  accounts,
  plans,
  accountPlanAssignments,
} from "../db/schema";

import {
  generateApiKey,
  hashApiKey,
} from "../utils/api-key";

export class AccountPlanNotFoundError extends Error {
  constructor() {
    super("Account plan not found.");
    this.name = "AccountPlanNotFoundError";
  }
}

interface CreateAccountInput {
  name: string;
  planCode: string;
}

export async function createAccount(
  input: CreateAccountInput
) {
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  // Account creation and plan assignment must be atomic.
  const account = await db.transaction(async (tx) => {
    // Only predefined account plans are allowed during setup.
    const [selectedPlan] = await tx
      .select({
        id: plans.id,
        code: plans.code,
      })
      .from(plans)
      .where(
        and(
          eq(plans.code, input.planCode),
          eq(plans.type, "account"),
          eq(plans.isSystem, true),
          isNull(plans.ownerAccountId)
        )
      );

    if (!selectedPlan) {
      throw new AccountPlanNotFoundError();
    }

    // Persist the account without storing the plaintext key.
    const [newAccount] = await tx
      .insert(accounts)
      .values({
        name: input.name,
        apiKeyHash,
      })
      .returning({
        id: accounts.id,
        name: accounts.name,
        createdAt: accounts.createdAt,
      });

    if (!newAccount) {
      throw new Error("Failed to create account.");
    }

    // Assign the selected plan within the same transaction.
    await tx.insert(accountPlanAssignments).values({
      accountId: newAccount.id,
      planId: selectedPlan.id,
    });

    return {
      ...newAccount,
      plan: selectedPlan.code,
    };
  });

  // Reveal the original API key only in the creation response.
  return {
    account,
    apiKey,
  };
}