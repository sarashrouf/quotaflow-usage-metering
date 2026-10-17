import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import { env } from "../config/env";

// Reuse database connections instead of opening a new one
// for every incoming HTTP request.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
});

// Drizzle provides a typed interface for SQL queries.
export const db = drizzle({ client: pool });