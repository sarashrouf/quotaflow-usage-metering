
import {
  beforeAll,
  afterAll,
  describe,
  expect,
  it,
} from "vitest";

import request from "supertest";
import { randomUUID } from "node:crypto";

import { app } from "../app";
import { pool } from "../db/connection";
import { env } from "../config/env";

// Prevent integration tests from running against the development DB.
if (new URL(env.DATABASE_URL).pathname !== "/quota_test_db") {
  throw new Error("Integration tests require quota_test_db.");
}

const api = request(app);

let apiKey: string;
let userId: string;

const runId = randomUUID();

// Create a fresh account for testing.
async function createTestAccount(name: string): Promise<string> {
  const response = await api
    .post("/api/accounts")
    .set("X-Admin-Key", env.ADMIN_SETUP_KEY)
    .send({
      name,
      planCode: "account-starter",
    });

  expect(response.status).toBe(201);
  expect(response.body.apiKey).toBeTypeOf("string");

  return response.body.apiKey as string;
}

// Create a user inside the specified account.
async function createTestUser(
  key: string,
  externalId: string,
  planCode = "user-premium"
): Promise<string> {
  const response = await api
    .post("/api/users")
    .set("X-API-Key", key)
    .send({
      externalId,
      planCode,
    });

  expect(response.status).toBe(201);

  return response.body.user.id as string;
}

describe("Consumption API integration", () => {
  beforeAll(async () => {
    apiKey = await createTestAccount(`Integration-${runId}`);

    userId = await createTestUser(
      apiKey,
      `test-user-${runId}`
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  // TEST 1: Accept consumption and prevent double deduction.
  it("accepts usage and prevents double consumption", async () => {
    const body = {
      requestId: `${runId}-accepted`,
      userId,
      units: 10,
    };

    const first = await api
      .post("/api/consume")
      .set("X-API-Key", apiKey)
      .send(body);

    expect(first.status).toBe(200);
    expect(first.body.status).toBe("accepted");
    expect(first.body.replayed).toBe(false);

    const replay = await api
      .post("/api/consume")
      .set("X-API-Key", apiKey)
      .send(body);

    expect(replay.status).toBe(200);
    expect(replay.body.status).toBe("accepted");
    expect(replay.body.replayed).toBe(true);

    const usage = await api
      .get("/api/usage")
      .set("X-API-Key", apiKey);

    expect(usage.status).toBe(200);
    expect(usage.body.account.consumedUnits).toBe(10);

    const currentUser = usage.body.users.find(
      (user: { id: string }) => user.id === userId
    );

    expect(currentUser).toBeDefined();
    expect(currentUser.consumedUnits).toBe(10);
  });

  // TEST 2: Same request ID cannot be reused with different units.
  it("rejects the same request ID with different units", async () => {
    const requestId = `${runId}-conflict`;

    const first = await api
      .post("/api/consume")
      .set("X-API-Key", apiKey)
      .send({
        requestId,
        userId,
        units: 5,
      });

    expect(first.status).toBe(200);
    expect(first.body.status).toBe("accepted");

    const second = await api
      .post("/api/consume")
      .set("X-API-Key", apiKey)
      .send({
        requestId,
        userId,
        units: 8,
      });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("REQUEST_ID_CONFLICT");
  });

  // TEST 3: Reject requests exceeding the per-request limit.
  it("rejects consumption above max per request", async () => {
    const response = await api
      .post("/api/consume")
      .set("X-API-Key", apiKey)
      .send({
        requestId: `${runId}-over-limit`,
        userId,
        units: 120,
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("rejected");
    expect(response.body.rejectionLevel).toBe("account");
    expect(response.body.rejectionRule).toBe("MAX_PER_REQUEST");
  });

  // TEST 4: Prevent access to users from another account.
  it("isolates users belonging to another account", async () => {
    const secondApiKey = await createTestAccount(`Other-${runId}`);

    const response = await api
      .post("/api/consume")
      .set("X-API-Key", secondApiKey)
      .send({
        requestId: `${runId}-isolation`,
        userId,
        units: 5,
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("USER_NOT_FOUND");
  });

  // TEST 5: Plan changes must preserve existing consumption.
  it("preserves consumed units after changing the user plan", async () => {
    const anotherUserId = await createTestUser(
      apiKey,
      `plan-change-${runId}`
    );

    const consumed = await api
      .post("/api/consume")
      .set("X-API-Key", apiKey)
      .send({
        requestId: `${runId}-plan-before`,
        userId: anotherUserId,
        units: 10,
      });

    expect(consumed.status).toBe(200);
    expect(consumed.body.status).toBe("accepted");

    const planResponse = await api
      .get("/api/plans")
      .set("X-API-Key", apiKey);

    const basicPlan = planResponse.body.plans.find(
      (plan: { code: string }) => plan.code === "user-basic"
    );

    expect(basicPlan).toBeDefined();

    const switched = await api
      .patch(`/api/users/${anotherUserId}/plan`)
      .set("X-API-Key", apiKey)
      .send({
        planId: basicPlan.id,
      });

    expect(switched.status).toBe(200);

    const usage = await api
      .get("/api/usage")
      .set("X-API-Key", apiKey);

    const currentUser = usage.body.users.find(
      (user: { id: string }) => user.id === anotherUserId
    );

    expect(currentUser).toBeDefined();
    expect(currentUser.planCode).toBe("user-basic");
    expect(currentUser.consumedUnits).toBe(10);
    expect(currentUser.monthlyAllowance).toBe(100);
    expect(currentUser.remainingUnits).toBe(90);
  });

  // TEST 6: Concurrent retries must deduct units only once.
  it("consumes only once for concurrent identical requests", async () => {
    const newUserId = await createTestUser(
      apiKey,
      `concurrent-retry-${runId}`
    );

    const body = {
      requestId: `${runId}-concurrent-retry`,
      userId: newUserId,
      units: 10,
    };

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        api
          .post("/api/consume")
          .set("X-API-Key", apiKey)
          .send(body)
      )
    );

    expect(
      responses.every((res) => res.status === 200)
    ).toBe(true);

    expect(
      responses.every((res) => res.body.status === "accepted")
    ).toBe(true);

    const newRequests = responses.filter(
      (res) => res.body.replayed === false
    );

    const replays = responses.filter(
      (res) => res.body.replayed === true
    );

    expect(newRequests).toHaveLength(1);
    expect(replays).toHaveLength(4);

    const usage = await api
      .get("/api/usage")
      .set("X-API-Key", apiKey);

    const currentUser = usage.body.users.find(
      (user: { id: string }) => user.id === newUserId
    );

    expect(currentUser).toBeDefined();
    expect(currentUser.consumedUnits).toBe(10);
  });

  // TEST 7: Rejected requests must remain rejected on retry.
  it("replays a rejected request without processing it again", async () => {
    const newUserId = await createTestUser(
      apiKey,
      `rejected-retry-${runId}`
    );

    const body = {
      requestId: `${runId}-rejected-retry`,
      userId: newUserId,
      units: 120,
    };

    const first = await api
      .post("/api/consume")
      .set("X-API-Key", apiKey)
      .send(body);

    expect(first.status).toBe(200);
    expect(first.body.status).toBe("rejected");
    expect(first.body.replayed).toBe(false);

    const second = await api
      .post("/api/consume")
      .set("X-API-Key", apiKey)
      .send(body);

    expect(second.status).toBe(200);
    expect(second.body.status).toBe("rejected");
    expect(second.body.replayed).toBe(true);

    const usage = await api
      .get("/api/usage")
      .set("X-API-Key", apiKey);

    const currentUser = usage.body.users.find(
      (user: { id: string }) => user.id === newUserId
    );

    expect(currentUser).toBeDefined();
    expect(currentUser.consumedUnits).toBe(0);
  });
  it("accepts the exact monthly limit and rejects the next unit", async () => {
  // Create a fresh user with no previous usage.
  const newUserId = await createTestUser(
    apiKey,
    `boundary-user-${runId}`,
    "user-basic"
  );

  // Basic: monthlyAllowance = 100, maxPerRequest = 20.
  // Five separate requests of 20 units = exactly 100.
  for (let index = 1; index <= 5; index++) {
    const response = await api
      .post("/api/consume")
      .set("X-API-Key", apiKey)
      .send({
        requestId: `${runId}-boundary-${index}`,
        userId: newUserId,
        units: 20,
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("accepted");
  }

  // One extra unit must be rejected.
  const exceeded = await api
    .post("/api/consume")
    .set("X-API-Key", apiKey)
    .send({
      requestId: `${runId}-boundary-extra`,
      userId: newUserId,
      units: 1,
    });

  expect(exceeded.status).toBe(200);
  expect(exceeded.body.status).toBe("rejected");
  expect(exceeded.body.rejectionLevel).toBe("user");
  expect(exceeded.body.rejectionRule).toBe("MONTHLY_ALLOWANCE");

  const usage = await api
    .get("/api/usage")
    .set("X-API-Key", apiKey);

  const currentUser = usage.body.users.find(
    (user: { id: string }) => user.id === newUserId
  );

  expect(currentUser.consumedUnits).toBe(100);
  expect(currentUser.remainingUnits).toBe(0);
});

it("protects usage data with API key authentication", async () => {
  const missingKey = await api
    .get("/api/usage");

  expect(missingKey.status).toBe(401);
  expect(missingKey.body.error.code).toBe(
    "MISSING_API_KEY"
  );

  const invalidKey = await api
    .get("/api/usage")
    .set("X-API-Key", `um_${"a".repeat(64)}`);

  expect(invalidKey.status).toBe(401);
  expect(invalidKey.body.error.code).toBe(
    "INVALID_API_KEY"
  );
});

it("rejects invalid consumption units", async () => {
  for (const invalidUnits of [0, -5, 1.5]) {
    const response = await api
      .post("/api/consume")
      .set("X-API-Key", apiKey)
      .send({
        requestId: randomUUID(),
        userId,
        units: invalidUnits,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(
      "VALIDATION_ERROR"
    );
  }
});
it("keeps consumed units when a plan is downgraded below usage", async () => {
  const testUserId = await createTestUser(
    apiKey,
    `downgrade-${runId}`,
    "user-premium"
  );

  // Consume 80 units while Premium permits it.
  const consumed = await api
    .post("/api/consume")
    .set("X-API-Key", apiKey)
    .send({
      requestId: `${runId}-downgrade-consume`,
      userId: testUserId,
      units: 80,
    });

  expect(consumed.status).toBe(200);
  expect(consumed.body.status).toBe("accepted");

  // Create a lower-limit custom user plan.
  const createdPlan = await api
    .post("/api/plans")
    .set("X-API-Key", apiKey)
    .send({
      code: `downgrade-${runId}`,
      name: "Downgrade Test",
      type: "user",
      monthlyAllowance: 50,
      maxPerRequest: 20,
    });

  expect(createdPlan.status).toBe(201);

  // Move the user to the new plan.
  const switched = await api
    .patch(`/api/users/${testUserId}/plan`)
    .set("X-API-Key", apiKey)
    .send({
      planId: createdPlan.body.plan.id,
    });

  expect(switched.status).toBe(200);

  // Usage must remain 80, even though the new limit is 50.
  const usage = await api
    .get("/api/usage")
    .set("X-API-Key", apiKey);

  const currentUser = usage.body.users.find(
    (user: { id: string }) => user.id === testUserId
  );

  expect(currentUser.consumedUnits).toBe(80);
  expect(currentUser.monthlyAllowance).toBe(50);
  expect(currentUser.remainingUnits).toBe(0);

  // No new consumption is allowed this month.
  const rejected = await api
    .post("/api/consume")
    .set("X-API-Key", apiKey)
    .send({
      requestId: `${runId}-downgrade-after`,
      userId: testUserId,
      units: 1,
    });

  expect(rejected.status).toBe(200);
  expect(rejected.body.status).toBe("rejected");
  expect(rejected.body.rejectionLevel).toBe("user");
  expect(rejected.body.rejectionRule).toBe("MONTHLY_ALLOWANCE");
});
it("prevents another account from modifying a custom plan", async () => {
  // Create a custom plan owned by the first account.
  const created = await api
    .post("/api/plans")
    .set("X-API-Key", apiKey)
    .send({
      code: `private-plan-${runId}`,
      name: "Private Plan",
      type: "user",
      monthlyAllowance: 200,
      maxPerRequest: 20,
    });

  expect(created.status).toBe(201);

  const planId = created.body.plan.id;

  // Create a second account with a different API key.
  const otherApiKey = await createTestAccount(
    `PlanAttacker-${runId}`
  );

  // The second account tries to edit the first account's plan.
  const unauthorizedUpdate = await api
    .patch(`/api/plans/${planId}`)
    .set("X-API-Key", otherApiKey)
    .send({
      monthlyAllowance: 800,
    });

  expect(unauthorizedUpdate.status).toBe(404);

  // Verify that the original plan was not modified.
  const ownPlans = await api
    .get("/api/plans")
    .set("X-API-Key", apiKey);

  const originalPlan = ownPlans.body.plans.find(
    (plan: { id: string }) => plan.id === planId
  );

  expect(originalPlan).toBeDefined();
  expect(originalPlan.monthlyAllowance).toBe(200);

  // Verify that the second account cannot see the private plan.
  const otherPlans = await api
    .get("/api/plans")
    .set("X-API-Key", otherApiKey);

  expect(
    otherPlans.body.plans.some(
      (plan: { id: string }) => plan.id === planId
    )
  ).toBe(false);
});
it("prevents assigning another account's private plan to a user", async () => {
  // Create a user belonging to our first account.
  const testUserId = await createTestUser(
    apiKey,
    `private-assignment-${runId}`
  );

  // Create a second account and a custom plan owned by it.
  const otherKey = await createTestAccount(
    `PlanOwner-${runId}`
  );

  const planResponse = await api
    .post("/api/plans")
    .set("X-API-Key", otherKey)
    .send({
      code: `other-plan-${runId}`,
      name: "Other Private Plan",
      type: "user",
      monthlyAllowance: 300,
      maxPerRequest: 30,
    });

  expect(planResponse.status).toBe(201);

  const otherPlanId = planResponse.body.plan.id;

  // First account tries to assign the second account's plan.
  const response = await api
    .patch(`/api/users/${testUserId}/plan`)
    .set("X-API-Key", apiKey)
    .send({
      planId: otherPlanId,
    });

  expect(response.status).toBe(404);

  // Verify the user's original plan is unchanged.
  const usersResponse = await api
    .get("/api/users")
    .set("X-API-Key", apiKey);

  const currentUser = usersResponse.body.users.find(
    (user: { id: string }) => user.id === testUserId
  );

  expect(currentUser).toBeDefined();
  expect(currentUser.planCode).toBe("user-premium");
});

it("enforces shared account quota across concurrent users", async () => {
  // Create a separate account so earlier tests do not affect usage.
  const sharedKey = await createTestAccount(
    `SharedQuota-${runId}`
  );

  // Create two users inside the same account.
  const saraId = await createTestUser(
    sharedKey,
    `sara-shared-${runId}`,
    "user-basic"
  );

  const ahmadId = await createTestUser(
    sharedKey,
    `ahmad-shared-${runId}`,
    "user-basic"
  );

  // Create a small custom ACCOUNT plan.
  const planResponse = await api
    .post("/api/plans")
    .set("X-API-Key", sharedKey)
    .send({
      code: `shared-account-${runId}`,
      name: "Shared Quota Test",
      type: "account",
      monthlyAllowance: 20,
      maxPerRequest: 5,
    });

  expect(planResponse.status).toBe(201);

  // Assign the custom plan to the account.
  const switched = await api
    .patch("/api/accounts/me/plan")
    .set("X-API-Key", sharedKey)
    .send({
      planId: planResponse.body.plan.id,
    });

  expect(switched.status).toBe(200);

  // Five requests per user, ten total.
  const requests = Array.from({ length: 10 }, (_, index) => ({
    requestId: `${runId}-shared-${index}`,
    userId: index % 2 === 0 ? saraId : ahmadId,
    units: 5,
  }));

  // Start all requests concurrently.
  const responses = await Promise.all(
    requests.map((body) =>
      api
        .post("/api/consume")
        .set("X-API-Key", sharedKey)
        .send(body)
    )
  );

  const accepted = responses.filter(
    (response) => response.body.status === "accepted"
  );

  const rejected = responses.filter(
    (response) => response.body.status === "rejected"
  );

  expect(responses.every((response) => response.status === 200)).toBe(true);
  expect(accepted).toHaveLength(4);
  expect(rejected).toHaveLength(6);

  // Read the actual persisted counters.
  const usage = await api
    .get("/api/usage")
    .set("X-API-Key", sharedKey);

  expect(usage.status).toBe(200);
  expect(usage.body.account.consumedUnits).toBe(20);
  expect(usage.body.account.remainingUnits).toBe(0);

  const sara = usage.body.users.find(
    (user: { id: string }) => user.id === saraId
  );

  const ahmad = usage.body.users.find(
    (user: { id: string }) => user.id === ahmadId
  );

  expect(sara).toBeDefined();
  expect(ahmad).toBeDefined();

  expect(
    sara.consumedUnits + ahmad.consumedUnits
  ).toBe(20);
});
});
