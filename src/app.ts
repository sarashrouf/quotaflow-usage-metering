import express from "express";
import { planRouter } from "./routes/plan.routes";
import { healthRouter } from "./routes/health.routes";
import { accountRouter } from "./routes/account.routes";
import { userRouter } from "./routes/user.routes";
export const app = express();
import { consumeRouter } from "./routes/consume.routes";
import { usageRouter } from "./routes/usage.routes";
// Parse incoming JSON requests.
app.use(express.json({ limit: "16kb" }));

// Public health endpoint.
app.use("/health", healthRouter);
app.use("/api/users", userRouter);
// Account provisioning is protected by the admin setup key.
app.use("/api/accounts", accountRouter);
app.use("/api/plans", planRouter);
app.use("/api/consume", consumeRouter);
app.use("/api", usageRouter);