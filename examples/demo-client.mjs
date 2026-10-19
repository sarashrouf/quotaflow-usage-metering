
import { randomUUID } from "node:crypto";

const BASE_URL =
  process.env.QUOTAFLOW_URL ?? "http://localhost:8080";

const ADMIN_KEY = process.env.ADMIN_SETUP_KEY;

if (!ADMIN_KEY) {
  console.error("Missing ADMIN_SETUP_KEY.");
  process.exit(1);
}

// General HTTP helper for our real backend API.
async function request(path, apiKey, method = "GET", body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      [apiKey.header]: apiKey.value,
    },
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body) }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      `${method} ${path} failed (${response.status}): ` +
        JSON.stringify(result)
    );
  }

  return result;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`DEMO FAILED: ${message}`);
  }
}

function printUsage(usage) {
  console.log(
    `  Account usage: ${usage.account.consumedUnits}` +
      ` / ${usage.account.monthlyAllowance}`
  );

  console.log(
    `  Account remaining: ${usage.account.remainingUnits}`
  );

  for (const user of usage.users) {
    console.log(
      `  ${user.externalId}: used=${user.consumedUnits}, ` +
        `remaining=${user.remainingUnits}`
    );
  }
}

async function main() {
  const suffix = randomUUID().slice(0, 8);

  const admin = {
    header: "X-Admin-Key",
    value: ADMIN_KEY,
  };

  console.log("\n=== QuotaFlow Example Client ===");
  console.log("Using:", BASE_URL);

  // 1. Provision an isolated example application.
  console.log("\n[1] Creating demo account");

  const createdAccount = await request(
    "/api/accounts",
    admin,
    "POST",
    {
      name: `QuotaFlow-Demo-${suffix}`,
      planCode: "account-starter",
    }
  );

  assert(
    typeof createdAccount.apiKey === "string",
    "Account API key was not returned"
  );

  // From here, we authenticate as the demo application.
  const auth = {
    header: "X-API-Key",
    value: createdAccount.apiKey,
  };

  console.log("  Demo account created.");

  // 2. Create small account and user plans.
  console.log("\n[2] Configuring plans");

  const accountPlanResponse = await request(
    "/api/plans",
    auth,
    "POST",
    {
      code: `demo-account-${suffix}`,
      name: "Demo Account Plan",
      type: "account",
      monthlyAllowance: 6,
      maxPerRequest: 10,
    }
  );

  const userPlanResponse = await request(
    "/api/plans",
    auth,
    "POST",
    {
      code: `demo-student-${suffix}`,
      name: "Demo Student Plan",
      type: "user",
      monthlyAllowance: 20,
      maxPerRequest: 3,
    }
  );

  assert(
    accountPlanResponse.plan?.id,
    "Account plan was not returned"
  );

  assert(
    userPlanResponse.plan?.id,
    "User plan was not returned"
  );

  const accountPlanId = accountPlanResponse.plan.id;

  await request(
    "/api/accounts/me/plan",
    auth,
    "PATCH",
    {
      planId: accountPlanId,
    }
  );

  console.log("  Account monthly allowance: 6");
  console.log("  Account max per request: 10");
  console.log("  Student max per request: 3");

  // 3. Register two users with different plans.
  console.log("\n[3] Registering two users");

  const studentResponse = await request(
    "/api/users",
    auth,
    "POST",
    {
      externalId: "student-001",
      planCode: userPlanResponse.plan.code,
    }
  );

  const premiumResponse = await request(
    "/api/users",
    auth,
    "POST",
    {
      externalId: "premium-001",
      planCode: "user-premium",
    }
  );

  const studentId = studentResponse.user.id;
  const premiumId = premiumResponse.user.id;

  console.log("  student-001 -> Custom Student");
  console.log("  premium-001 -> User Premium");

  // Always generate a new request ID for a NEW action.
  async function consume(label, userId, units) {
    const result = await request(
      "/api/consume",
      auth,
      "POST",
      {
        requestId: randomUUID(),
        userId,
        units,
      }
    );

    console.log(`\n  ${label}`);
    console.log(`  Requested units: ${units}`);
    console.log(`  Decision: ${result.status}`);

    if (result.status === "rejected") {
      console.log(
        `  Rejection level: ${result.rejectionLevel}`
      );

      console.log(
        `  Rejection rule: ${result.rejectionRule}`
      );
    }

    const usage = await request("/api/usage", auth);

    printUsage(usage);

    return { result, usage };
  }

  // 4. Accepted request.
  console.log("\n[4] Testing accepted consumption");

  const accepted = await consume(
    "Student processes a 2-unit document",
    studentId,
    2
  );

  assert(
    accepted.result.status === "accepted",
    "Expected accepted request"
  );

  assert(
    accepted.usage.account.consumedUnits === 2,
    "Account should have consumed 2 units"
  );

  // 5. Rejection from user's max-per-request rule.
  console.log("\n[5] Testing USER quota rejection");

  const userRejected = await consume(
    "Student requests 4 units, limit is 3",
    studentId,
    4
  );

  assert(
    userRejected.result.status === "rejected",
    "Expected user-level rejection"
  );

  assert(
    userRejected.result.rejectionLevel === "user",
    "Expected USER rejection level"
  );

  assert(
    userRejected.usage.account.consumedUnits === 2,
    "Rejected request must not consume units"
  );

  // 6. Rejection from account's shared allowance.
  console.log("\n[6] Testing ACCOUNT quota rejection");

  const accountRejected = await consume(
    "Premium requests 5 units; account has only 4 left",
    premiumId,
    5
  );

  assert(
    accountRejected.result.status === "rejected",
    "Expected account-level rejection"
  );

  assert(
    accountRejected.result.rejectionLevel === "account",
    "Expected ACCOUNT rejection level"
  );

  assert(
    accountRejected.usage.account.consumedUnits === 2,
    "Account rejection must not consume units"
  );

  // 7. Update the existing account plan definition.
  console.log("\n[7] Increasing account monthly allowance");

  await request(
    `/api/plans/${accountPlanId}`,
    auth,
    "PATCH",
    {
      monthlyAllowance: 12,
    }
  );

  console.log("  Changed account allowance: 6 -> 12");
  console.log("  No client consumption logic changed.");

  // 8. A new action succeeds under the updated rules.
  // It must have a NEW requestId, not a replay.
  console.log("\n[8] Retrying action with NEW request ID");

  const acceptedAfterUpdate = await consume(
    "Premium processes a 5-unit document",
    premiumId,
    5
  );

  assert(
    acceptedAfterUpdate.result.status === "accepted",
    "Request should be accepted after plan update"
  );

  assert(
    acceptedAfterUpdate.usage.account.consumedUnits === 7,
    "Expected total account usage of 7"
  );

  assert(
    acceptedAfterUpdate.usage.account.remainingUnits === 5,
    "Expected 5 units remaining at account level"
  );

  const studentUsage =
    acceptedAfterUpdate.usage.users.find(
      (user) => user.id === studentId
    );

  const premiumUsage =
    acceptedAfterUpdate.usage.users.find(
      (user) => user.id === premiumId
    );

  assert(
    studentUsage?.consumedUnits === 2,
    "Student should have consumed 2 units"
  );

  assert(
    premiumUsage?.consumedUnits === 5,
    "Premium user should have consumed 5 units"
  );

  // 9. Verify persisted request decisions.
  console.log("\n[9] Checking request history");

  const historyResponse = await request(
    "/api/history?page=1&limit=20",
    auth
  );

  const records = historyResponse.history;

  const acceptedCount = records.filter(
    (item) => item.status === "accepted"
  ).length;

  const rejectedCount = records.filter(
    (item) => item.status === "rejected"
  ).length;

  assert(
    acceptedCount === 2,
    "History should contain 2 accepted requests"
  );

  assert(
    rejectedCount === 2,
    "History should contain 2 rejected requests"
  );

  console.log(`  Accepted records: ${acceptedCount}`);
  console.log(`  Rejected records: ${rejectedCount}`);

  console.log("\n================================");
  console.log("DEMO PASSED");
  console.log("All quota decisions and totals are correct.");
  console.log("================================\n");
}

main().catch((error) => {
  console.error("\nDEMO FAILED:", error.message);
  process.exitCode = 1;
});
