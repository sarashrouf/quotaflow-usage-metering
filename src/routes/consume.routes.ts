import { Router } from "express";
import { z } from "zod";

import { requireAccountAuth } from "../middleware/account-auth.middleware";

import {
  consumeUnits,
  UserNotFoundError,
  RequestIdConflictError,
} from "../services/consumption.service";

export const consumeRouter = Router();

consumeRouter.use(requireAccountAuth);

const consumeSchema = z.object({
  requestId: z.string().trim().min(1).max(128),
  userId: z.uuid(),
  units: z.number().int().positive().max(1_000_000_000),
}).strict();

consumeRouter.post("/", async (req, res, next) => {
  const parsed = consumeSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid consumption request.",
        details: parsed.error.issues,
      },
    });

    return;
  }

  try {
    const accountId = res.locals.accountId as string;

    const result = await consumeUnits(
      accountId,
      parsed.data
    );

    // A rejected quota decision is a processed business result.
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      res.status(404).json({
        error: {
          code: "USER_NOT_FOUND",
          message: error.message,
        },
      });
      return;
    }

    if (error instanceof RequestIdConflictError) {
      res.status(409).json({
        error: {
          code: "REQUEST_ID_CONFLICT",
          message: error.message,
        },
      });
      return;
    }

    next(error);
  }
});