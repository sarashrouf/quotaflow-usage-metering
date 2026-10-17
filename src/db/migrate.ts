import { migrate } from "drizzle-orm/node-postgres/migrator";

import { db, pool } from "./connection";

async function runMigrations(): Promise<void> {
  try {
    console.log("Starting database migrations...");

    // Read the generated SQL migrations and apply
    // only those that have not already been applied.
    await migrate(db, {
      migrationsFolder: "./drizzle",
    });

    console.log("Database migrations completed successfully.");
  } catch (error) {
    console.error("Database migration failed:", error);

    process.exitCode = 1;
  } finally {
    // Close database connections before exiting.
    await pool.end();
  }
}

runMigrations();