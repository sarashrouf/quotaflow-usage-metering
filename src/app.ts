import express from "express";
import { healthRouter } from "./routes/health.routes";

// Create and configure the Express application.
export const app = express();

// Parse incoming JSON request bodies.
app.use(express.json());

// Register application routes.
app.use("/health", healthRouter);