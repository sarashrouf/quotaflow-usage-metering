import { Router } from "express";
import { pool } from "../db/connection";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  try {
    // Execute a lightweight query to verify database access.
    await pool.query("SELECT 1");

    res.status(200).json({
      status: "ok",
      service: "usage-metering-service",
      database: "connected",
    });
  } catch (error) {
    // Log technical details internally, not in the API response.
    console.error("Database health check failed:", error);

    res.status(503).json({
      status: "unavailable",
      database: "disconnected",
    });
  }
});