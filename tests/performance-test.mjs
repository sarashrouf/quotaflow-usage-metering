
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

const baseUrl = "http://localhost:3000";
const adminKey = process.env.ADMIN_SETUP_KEY;

const concurrencyLevels = [1, 5, 10, 25];
const requestsPerLevel = 100;

if (!adminKey) {
  throw new Error("ADMIN_SETUP_KEY is missing.");
}

async function apiRequest(path, key, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      [key.type]: key.value,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${JSON.stringify(data)}`
    );
  }

  return data;
}

const admin = {
  type: "X-Admin-Key",
  value: adminKey,
};

function accountAuth(apiKey) {
  return {
    type: "X-API-Key",
    value: apiKey,
  };
}

async function createTestAccount() {
  const suffix = randomUUID().slice(0, 8);

  const created = await apiRequest(
    "/api/accounts",
    admin,
    {
      method: "POST",
      body: JSON.stringify({
        name: `Performance-${suffix}`,
        planCode: "account-starter",
      }),
    }
  );

  const apiKey = created.apiKey;
  const auth = accountAuth(apiKey);

  const user = await apiRequest(
    "/api/users",
    auth,
    {
      method: "POST",
      body: JSON.stringify({
        externalId: `perf-user-${suffix}`,
        planCode: "user-basic",
      }),
    }
  );

  return {
    auth,
    userId: user.user.id,
  };
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;

  const index = Math.ceil(sorted.length * fraction) - 1;
  return sorted[Math.max(0, index)];
}

async function runLevel(concurrency) {
  const { auth, userId } = await createTestAccount();

  const latencies = [];
  let accepted = 0;
  let rejected = 0;
  let errors = 0;
  let nextRequest = 0;

  const batchId = randomUUID();
  const start = performance.now();

  async function worker() {
    while (true) {
      const index = nextRequest++;

      if (index >= requestsPerLevel) return;

      const requestStart = performance.now();

      try {
        const result = await apiRequest(
          "/api/consume",
          auth,
          {
            method: "POST",
            body: JSON.stringify({
              requestId: `${batchId}-${index}`,
              userId,
              units: 1,
            }),
          }
        );

        const elapsed = performance.now() - requestStart;
        latencies.push(elapsed);

        if (result.status === "accepted") {
          accepted++;
        } else if (result.status === "rejected") {
          rejected++;
        } else {
          errors++;
        }
      } catch (error) {
        errors++;
        console.error(
          `Request ${index} failed:`,
          error.message
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker())
  );

  const durationMs = performance.now() - start;

  latencies.sort((a, b) => a - b);

  const average =
    latencies.length > 0
      ? latencies.reduce((sum, value) => sum + value, 0) /
        latencies.length
      : 0;

  const p95 = percentile(latencies, 0.95);

  const throughput =
    requestsPerLevel / (durationMs / 1000);

  // Verify actual persisted usage through the API.
  const usage = await apiRequest("/api/usage", auth);

  const testUser = usage.users.find(
    (user) => user.id === userId
  );

  const consistent =
    errors === 0 &&
    rejected === 0 &&
    accepted === requestsPerLevel &&
    testUser?.consumedUnits === requestsPerLevel &&
    usage.account.consumedUnits === requestsPerLevel;

  console.log("\n--------------------------------");
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Total requests: ${requestsPerLevel}`);
  console.log(`Accepted: ${accepted}`);
  console.log(`Rejected: ${rejected}`);
  console.log(`HTTP/Network errors: ${errors}`);
  console.log(`Average latency: ${average.toFixed(2)} ms`);
  console.log(`P95 latency: ${p95.toFixed(2)} ms`);
  console.log(`Throughput: ${throughput.toFixed(2)} req/s`);
  console.log(`Total duration: ${(durationMs / 1000).toFixed(2)} s`);
  console.log(`Database usage: ${testUser?.consumedUnits}`);
  console.log(`Consistency: ${consistent ? "PASS" : "FAIL"}`);

  if (!consistent) {
    throw new Error(
      `Performance consistency check failed at concurrency ${concurrency}.`
    );
  }

  return {
    concurrency,
    averageMs: Number(average.toFixed(2)),
    p95Ms: Number(p95.toFixed(2)),
    throughput: Number(throughput.toFixed(2)),
    errors,
  };
}

async function main() {
  console.log("QuotaFlow Performance Test");
  console.log(`Requests per level: ${requestsPerLevel}`);

  const results = [];

  for (const concurrency of concurrencyLevels) {
    results.push(await runLevel(concurrency));
  }

  console.log("\n=== FINAL RESULTS ===");
  console.table(results);

  console.log("All performance consistency checks passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
