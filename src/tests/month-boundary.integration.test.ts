
import {
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import request from "supertest";
import { randomUUID } from "node:crypto";

// Replace our clock with a controllable function.
// Vitest applies this mock before importing the application.
vi.mock("../utils/clock", async () => {
  const actual = await vi.importActual<
    typeof import("../utils/clock")
  >("../utils/clock");

  return {
    ...actual,
    currentTime: vi.fn(() => new Date()),
  };
});

import { currentTime } from "../utils/clock";
import { app } from "../app";
import { pool } from "../db/connection";
import { env } from "../config/env";

if (new URL(env.DATABASE_URL).pathname !== "/quota_test_db") {
  throw new Error(
    "Month boundary tests require quota_test_db."
  );
}

const api = request(app);
const runId = randomUUID();

async function createTestAccount() {
  const response = await api
    .post("/api/accounts")
    .set("X-Admin-Key", env.ADMIN_SETUP_KEY)
    .send({
      name: `MonthTest-${runId}`,
      planCode: "account-starter",
    });

  expect(response.status).toBe(201);

  return response.body.apiKey as string;
}

describe("UTC Month Boundary", () => {
  afterAll(async () => {
    vi.restoreAllMocks();
    await pool.end();
  });

  it("starts a fresh monthly counter without deleting previous usage", async () => {
    const apiKey = await createTestAccount();

    // Create a user plan limited to 10 units per month.
    const planResponse = await api
      .post("/api/plans")
      .set("X-API-Key", apiKey)
      .send({
        code: `month-test-${runId}`,
        name: "Month Boundary Plan",
        type: "user",
        monthlyAllowance: 10,
        maxPerRequest: 10,
      });

    expect(planResponse.status).toBe(201);

    const userResponse = await api
      .post("/api/users")
      .set("X-API-Key", apiKey)
      .send({
        externalId: `month-user-${runId}`,
        planCode: planResponse.body.plan.code,
      });

    expect(userResponse.status).toBe(201);

    const userId = userResponse.body.user.id as string;

    // STEP 1: Set the clock to the final minute of October.
    vi.mocked(currentTime).mockReturnValue(
      new Date("2026-10-31T23:59:00.000Z")
    );

    const october = await api
      .post("/api/consume")
      .set("X-API-Key", apiKey)
      .send({
        requestId: `${runId}-october`,
        userId,
        units: 10,
      });

    expect(october.status).toBe(200);
    expect(october.body.status).toBe("accepted");

    // STEP 2: October has no remaining user allowance.
    const octoberExtra = await api
      .post("/api/consume")
      .set("X-API-Key", apiKey)
      .send({
        requestId: `${runId}-october-extra`,
        userId,
        units: 1,
      });

    expect(octoberExtra.status).toBe(200);
    expect(octoberExtra.body.status).toBe("rejected");
    expect(octoberExtra.body.rejectionLevel).toBe("user");
    expect(octoberExtra.body.rejectionRule).toBe(
      "MONTHLY_ALLOWANCE"
    );

    const octoberUsage = await api
      .get("/api/usage")
      .set("X-API-Key", apiKey);

    expect(octoberUsage.status).toBe(200);
    expect(octoberUsage.body.month).toBe("2026-10-01");

    const octoberUser = octoberUsage.body.users.find(
      (user: { id: string }) => user.id === userId
    );

    expect(octoberUser.consumedUnits).toBe(10);
    expect(octoberUser.remainingUnits).toBe(0);

    // STEP 3: Move our TEST CLOCK to November.
    vi.mocked(currentTime).mockReturnValue(
      new Date("2026-11-01T00:00:00.000Z")
    );

    const novemberBefore = await api
      .get("/api/usage")
      .set("X-API-Key", apiKey);

    expect(novemberBefore.body.month).toBe("2026-11-01");

    const freshUser = novemberBefore.body.users.find(
      (user: { id: string }) => user.id === userId
    );

    expect(freshUser.consumedUnits).toBe(0);
    expect(freshUser.remainingUnits).toBe(10);

    // STEP 4: The same user can consume in the new month.
    const november = await api
      .post("/api/consume")
      .set("X-API-Key", apiKey)
      .send({
        requestId: `${runId}-november`,
        userId,
        units: 10,
      });

    expect(november.status).toBe(200);
    expect(november.body.status).toBe("accepted");

    const novemberUsage = await api
      .get("/api/usage")
      .set("X-API-Key", apiKey);

    const novemberUser = novemberUsage.body.users.find(
      (user: { id: string }) => user.id === userId
    );

    expect(novemberUser.consumedUnits).toBe(10);
    expect(novemberUser.remainingUnits).toBe(0);
// Verify historical usage through the public API.
// The current test clock is November.

const historicalOctober = await api
  .get("/api/usage?month=2026-10")
  .set("X-API-Key", apiKey);

expect(historicalOctober.status).toBe(200);
expect(historicalOctober.body.month).toBe("2026-10-01");

const historicalOctoberUser =
  historicalOctober.body.users.find(
    (user: { id: string }) => user.id === userId
  );

expect(historicalOctoberUser).toBeDefined();
expect(historicalOctoberUser.consumedUnits).toBe(10);
expect(historicalOctoberUser.remainingUnits).toBe(0);

// Verify November independently.
const historicalNovember = await api
  .get("/api/usage?month=2026-11")
  .set("X-API-Key", apiKey);

expect(historicalNovember.status).toBe(200);
expect(historicalNovember.body.month).toBe("2026-11-01");

const historicalNovemberUser =
  historicalNovember.body.users.find(
    (user: { id: string }) => user.id === userId
  );

expect(historicalNovemberUser).toBeDefined();
expect(historicalNovemberUser.consumedUnits).toBe(10);
    // STEP 5: October's records must still be stored.
    const savedMonths = await pool.query(
      `
        SELECT month::text, consumed_units
        FROM user_usage
        WHERE user_id = $1
        ORDER BY month
      `,
      [userId]
    );

    expect(savedMonths.rows).toEqual([
      {
        month: "2026-10-01",
        consumed_units: "10",
      },
      {
        month: "2026-11-01",
        consumed_units: "10",
      },
    ]);

    // All three distinct consumption attempts remain in history.
    const history = await api
      .get("/api/history?limit=10")
      .set("X-API-Key", apiKey);

    expect(history.status).toBe(200);
    expect(history.body.history).toHaveLength(3);

    // Invalid calendar months must return HTTP 400.
for (const invalidMonth of [
  "2026-00",
  "2026-13",
  "October",
  "2026-1",
]) {
  const response = await api
    .get(`/api/usage?month=${invalidMonth}`)
    .set("X-API-Key", apiKey);

  expect(response.status).toBe(400);
  expect(response.body.error.code).toBe(
    "VALIDATION_ERROR"
  );
}
// Account totals must also remain independent.
expect(
  historicalOctober.body.account.consumedUnits
).toBe(10);

expect(
  historicalNovember.body.account.consumedUnits
).toBe(10);
  });
});
