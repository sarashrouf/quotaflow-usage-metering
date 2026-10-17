import { db, pool } from "./connection";
import { plans } from "./schema";

const predefinedPlans: (typeof plans.$inferInsert)[] = [
  {
    code: "account-starter",
    name: "Starter",
    type: "account",
    monthlyAllowance: 1000,
    maxPerRequest: 100,
    isSystem: true,
    ownerAccountId: null,
  },
  {
    code: "account-pro",
    name: "Pro",
    type: "account",
    monthlyAllowance: 10000,
    maxPerRequest: 500,
    isSystem: true,
    ownerAccountId: null,
  },
  {
    code: "user-basic",
    name: "Basic",
    type: "user",
    monthlyAllowance: 100,
    maxPerRequest: 20,
    isSystem: true,
    ownerAccountId: null,
  },
  {
    code: "user-premium",
    name: "Premium",
    type: "user",
    monthlyAllowance: 1000,
    maxPerRequest: 100,
    isSystem: true,
    ownerAccountId: null,
  },
];

async function seed(): Promise<void> {
  try {
    await db
      .insert(plans)
      .values(predefinedPlans)
      .onConflictDoNothing({
        target: plans.code,
      });

    console.log("Predefined plans initialized successfully.");
  } finally {
    await pool.end();
  }
}

seed().catch((error: unknown) => {
  console.error("Failed to seed plans:", error);
  process.exitCode = 1;
});