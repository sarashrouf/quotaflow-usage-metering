
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import request from "supertest";
import { randomUUID } from "node:crypto";

import { app } from "../app";
import { pool } from "../db/connection";
import { env } from "../config/env";

// Never run integration tests against the development DB.
if (new URL(env.DATABASE_URL).pathname !== "/quota_test_db") {
  throw new Error("Security tests require quota_test_db.");
}

const api = request(app);
const runId = randomUUID();

let accountAKey: string;
let accountBKey: string;
let accountAUserId: string;
let accountBUserId: string;

async function createAccount(name: string): Promise<string> {
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

async function createUser(
  apiKey: string,
  externalId: string
): Promise<string> {
  const response = await api
    .post("/api/users")
    .set("X-API-Key", apiKey)
    .send({
      externalId,
      planCode: "user-basic",
    });

  expect(response.status).toBe(201);

  return response.body.user.id as string;
}

describe("Security and account isolation", () => {
  beforeAll(async () => {
    accountAKey = await createAccount(`Security-A-${runId}`);
    accountBKey = await createAccount(`Security-B-${runId}`);

    accountAUserId = await createUser(
      accountAKey,
      `user-a-${runId}`
    );

    accountBUserId = await createUser(
      accountBKey,
      `user-b-${runId}`
    );

    const consumed = await api
      .post("/api/consume")
      .set("X-API-Key", accountAKey)
      .send({
        requestId: `${runId}-private-consumption`,
        userId: accountAUserId,
        units: 5,
      });

    expect(consumed.status).toBe(200);
    expect(consumed.body.status).toBe("accepted");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("rejects missing and malformed API keys", async () => {
    const missing = await api.get("/api/users");

    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe("MISSING_API_KEY");

    const malformed = await api
      .get("/api/users")
      .set("X-API-Key", "invalid-key");

    expect(malformed.status).toBe(401);
    expect(malformed.body.error.code).toBe("INVALID_API_KEY");

    // Correct format, but not a provisioned account key.
    const unknown = await api
      .get("/api/users")
      .set("X-API-Key", `um_${"f".repeat(64)}`);

    expect(unknown.status).toBe(401);
    expect(unknown.body.error.code).toBe("INVALID_API_KEY");
  });

  it("isolates user listings between accounts", async () => {
    const accountAUsers = await api
      .get("/api/users")
      .set("X-API-Key", accountAKey);

    const accountBUsers = await api
      .get("/api/users")
      .set("X-API-Key", accountBKey);

    expect(accountAUsers.status).toBe(200);
    expect(accountBUsers.status).toBe(200);

    expect(
      accountAUsers.body.users.some(
        (user: { id: string }) => user.id === accountAUserId
      )
    ).toBe(true);

    expect(
      accountBUsers.body.users.some(
        (user: { id: string }) => user.id === accountAUserId
      )
    ).toBe(false);

    expect(
      accountAUsers.body.users.some(
        (user: { id: string }) => user.id === accountBUserId
      )
    ).toBe(false);
  });

  it("isolates usage data between accounts", async () => {
    const usageA = await api
      .get("/api/usage")
      .set("X-API-Key", accountAKey);

    const usageB = await api
      .get("/api/usage")
      .set("X-API-Key", accountBKey);

    expect(usageA.status).toBe(200);
    expect(usageB.status).toBe(200);

    expect(usageA.body.account.consumedUnits).toBe(5);
    expect(usageB.body.account.consumedUnits).toBe(0);

    expect(
      usageB.body.users.some(
        (user: { id: string }) => user.id === accountAUserId
      )
    ).toBe(false);
  });

  it("isolates request history between accounts", async () => {
    const historyA = await api
      .get("/api/history")
      .set("X-API-Key", accountAKey);

    const historyB = await api
      .get("/api/history")
      .set("X-API-Key", accountBKey);

    expect(historyA.status).toBe(200);
    expect(historyB.status).toBe(200);

    expect(
      historyA.body.history.some(
        (record: { userId: string }) =>
          record.userId === accountAUserId
      )
    ).toBe(true);

    expect(
      historyB.body.history.some(
        (record: { userId: string }) =>
          record.userId === accountAUserId
      )
    ).toBe(false);

    expect(historyB.body.history).toHaveLength(0);
  });

  it("cannot retrieve another account's history by userId", async () => {
    const response = await api
      .get(`/api/history?userId=${accountAUserId}`)
      .set("X-API-Key", accountBKey);

    expect(response.status).toBe(200);
    expect(response.body.history).toHaveLength(0);
  });
});
