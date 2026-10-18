import { randomUUID } from "node:crypto";

const baseUrl = "http://localhost:3000";
const apiKey = process.env.ACCOUNT_API_KEY;

if (!apiKey) {
  throw new Error("ACCOUNT_API_KEY is missing.");
}

// Helper to send authenticated requests.
async function apiRequest(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `${response.status}: ${JSON.stringify(data)}`
    );
  }

  return data;
}

async function main() {
  // Unique suffix to avoid collisions between test runs.
  const suffix = randomUUID().slice(0, 8);

  // Verify that the account has enough allowance.
  const before = await apiRequest("/api/usage");

  if (
    before.account.remainingUnits < 20 ||
    before.account.maxPerRequest < 5
  ) {
    throw new Error(
      "The account needs at least 20 remaining units and maxPerRequest >= 5."
    );
  }

  // Create an isolated test plan.
  const createdPlan = await apiRequest("/api/plans", {
    method: "POST",
    body: JSON.stringify({
      code: `concurrency-${suffix}`,
      name: "Concurrency Test",
      type: "user",
      monthlyAllowance: 20,
      maxPerRequest: 5,
    }),
  });

  // Create a new user with zero initial usage.
  const createdUser = await apiRequest("/api/users", {
    method: "POST",
    body: JSON.stringify({
      externalId: `concurrency-user-${suffix}`,
      planCode: createdPlan.plan.code,
    }),
  });

  const userId = createdUser.user.id;
  const batchId = randomUUID();

  // Prepare ten independent requests.
  const requests = Array.from({ length: 10 }, (_, index) => ({
    requestId: `${batchId}-${index}`,
    userId,
    units: 5,
  }));

  // Send all ten requests without awaiting them one by one.
  const responses = await Promise.all(
    requests.map((request) =>
      apiRequest("/api/consume", {
        method: "POST",
        body: JSON.stringify(request),
      })
    )
  );

  const accepted = responses.filter(
    (result) => result.status === "accepted"
  );

  const rejected = responses.filter(
    (result) => result.status === "rejected"
  );

  console.log("Requests sent:", responses.length);
  console.log("Accepted:", accepted.length);
  console.log("Rejected:", rejected.length);

  // Verify the final database state through the Usage API.
  const after = await apiRequest("/api/usage");

  const testUser = after.users.find(
    (user) => user.id === userId
  );

  console.log("User consumed units:", testUser?.consumedUnits);
  console.log("User remaining:", testUser?.remainingUnits);

  const passed =
    accepted.length === 4 &&
    rejected.length === 6 &&
    testUser?.consumedUnits === 20 &&
    testUser?.remainingUnits === 0;

  if (!passed) {
    throw new Error(
      "Concurrency test FAILED: quota consistency was not preserved."
    );
  }

  console.log("PASS: Concurrency quota checks succeeded.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});