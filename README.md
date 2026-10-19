# QuotaFlow — Usage Metering and Quota Service

QuotaFlow is a usage metering service built with TypeScript, Express, and PostgreSQL. It allows applications to track how many units their users consume and decide whether a new request should be accepted based on account-level and user-level limits.

The project also includes a React dashboard for managing plans, viewing usage, and testing consumption requests.

## Features

- Account authentication using API keys
- Predefined and customizable account and user plans
- Monthly allowances and per-request limits
- Shared account quotas and individual user quotas
- Safe concurrent consumption using PostgreSQL transactions
- Idempotent requests to prevent double charging on retries
- Usage history, monthly usage queries, and paginated request history
- A working example client demonstrating quota decisions and plan changes

## Tech Stack

- **Backend:** Node.js, TypeScript, Express
- **Database:** PostgreSQL, Drizzle ORM
- **Frontend:** React, Vite, Tailwind CSS
- **Deployment:** Docker Compose, Nginx
- **Testing:** Vitest, Supertest

## Getting Started

Make sure Docker and Docker Compose are installed.

1. Clone the repository.
2. Copy `.env.example` to `.env` and configure the required values.
3. Start the application:

```bash
docker compose up --build
```

Docker Compose starts PostgreSQL, runs database migrations and plan seeding, and starts the API and frontend.

Open the dashboard at **http://localhost:8080**.

The API is available at **http://localhost:3000**. You can check its status using `GET /health`.

## API Keys and Accounts

Accounts are created using the admin setup key:

```http
POST /api/accounts
X-Admin-Key: <ADMIN_SETUP_KEY>
Content-Type: application/json

{
  "name": "DocFlow",
  "planCode": "account-starter"
}
```

The response includes an account API key. Save it securely, since the service stores only its hash.

Use this key for account operations:

```http
X-API-Key: <ACCOUNT_API_KEY>
```

Each key grants access only to its own account and users.

## Main API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/accounts` | Create an account |
| GET | `/api/accounts/me` | View account information |
| PATCH | `/api/accounts/me/plan` | Change account plan |
| GET / POST | `/api/users` | List or create users |
| PATCH | `/api/users/:id/plan` | Change a user's plan |
| GET / POST | `/api/plans` | List or create plans |
| PATCH | `/api/plans/:id` | Update a custom plan |
| POST | `/api/consume` | Process a consumption request |
| GET | `/api/usage` | View current usage |
| GET | `/api/usage?month=2026-09` | View usage for a specific month |
| GET | `/api/history?page=1&limit=20` | View request history |

Example consumption request:

```json
{
  "requestId": "doc-001",
  "userId": "<USER_UUID>",
  "units": 5
}
```

The service returns an accepted or rejected decision. Rejected requests include the rule and level responsible for the rejection.

## Example Client

A command-line demo is included in `examples/demo-client.mjs`.

After starting Docker Compose, set the `ADMIN_SETUP_KEY` environment variable and run:

```bash
node examples/demo-client.mjs
```

The demo creates a separate account with two users, simulates accepted and rejected requests, updates a plan, and verifies the resulting usage and request history.

You can also use the React dashboard to manage plans and send requests manually.

## Testing

Automated tests cover quota rules, API authentication, account isolation, idempotency, concurrent requests, plan changes, and UTC month boundaries.

The integration tests require a separate PostgreSQL database named `quota_test_db`, with the schema and predefined plans initialized. Set `DATABASE_URL` to that database before running:

```bash
npx vitest run
```

**Latest result:** 26 tests passed.

A performance test is available at `tests/performance-test.mjs`. With the API running and `ADMIN_SETUP_KEY` configured, run:

```bash
node tests/performance-test.mjs
```

The local test used 100 requests per concurrency level:

| Concurrency | Avg. latency | P95 latency | Throughput |
|---|---:|---:|---:|
| 1 | 35.52 ms | 53.15 ms | 28.15 req/s |
| 5 | 73.48 ms | 89.32 ms | 66.10 req/s |
| 10 | 162.59 ms | 279.78 ms | 59.49 req/s |
| 25 | 291.55 ms | 328.00 ms | 76.12 req/s |

All 400 requests completed without HTTP or network errors, and the persisted usage totals matched the accepted requests. Latency increased under concurrency, partly due to competing requests for shared account data.

## Design Decisions and Assumptions

- One resource is measured: usage units.
- Every request must satisfy both the account plan and the user's plan.
- Consumption is all-or-nothing; rejected requests deduct nothing.
- Monthly usage follows UTC calendar months.
- Changing a plan does not reset previously consumed units.
- Custom plan updates apply to future requests without restarting the service.
- Reusing a request ID with identical details returns the stored decision. Reusing it with different details returns a conflict.
- PostgreSQL transactions and row locking protect usage totals during concurrent requests.
- Historical usage is retained. Historical usage queries display current plan limits alongside the selected month's consumption.

## Limitations

The project focuses on a single service and PostgreSQL database. It does not include billing, payments, user login, or distributed deployment. The performance results come from local testing and do not represent production capacity.