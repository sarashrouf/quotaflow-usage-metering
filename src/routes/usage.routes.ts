import { Router } from "express";
import { z } from "zod";

import { requireAccountAuth } from "../middleware/account-auth.middleware";
import { getUsageOverview } from "../services/usage.service";
import { getRequestHistory } from "../services/history.service";

export const usageRouter = Router();

usageRouter.use(requireAccountAuth);

// GET /api/usage
usageRouter.get("/usage", async (_req, res, next) => {
  try {
    const accountId = res.locals.accountId as string;

    const result = await getUsageOverview(accountId);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  userId: z.uuid().optional(),
}).strict();

// GET /api/history
usageRouter.get("/history", async (req, res, next) => {
  const parsed = historyQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid history query parameters.",
        details: parsed.error.issues,
      },
    });

    return;
  }

  try {
    const accountId = res.locals.accountId as string;

    const result = await getRequestHistory(
      accountId,
      parsed.data
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});