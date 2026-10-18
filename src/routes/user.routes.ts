import { Router } from "express";
import { z } from "zod";

import { requireAccountAuth } from "../middleware/account-auth.middleware";

import {
  createUser,
  listUsers,
  DuplicateUserError,
  UserPlanNotFoundError,
} from "../services/user.service";

import {
  changeUserPlan,
  PlanNotFoundError,
} from "../services/plan.service";

export const userRouter = Router();

// All user endpoints require an authenticated account.
userRouter.use(requireAccountAuth);

// Validation rules for user registration.
const createUserSchema = z.object({
  externalId: z.string().trim().min(1).max(100),
  planCode: z.string().trim().min(1).max(100),
}).strict();

// POST /api/users
userRouter.post("/", async (req, res, next) => {
  const validation = createUserSchema.safeParse(req.body);

  if (!validation.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid user data.",
        details: validation.error.issues,
      },
    });

    return;
  }

  try {
    const accountId = res.locals.accountId as string;

    const user = await createUser(
      accountId,
      validation.data
    );

    res.status(201).json({ user });
  } catch (error) {
    if (error instanceof DuplicateUserError) {
      res.status(409).json({
        error: {
          code: "DUPLICATE_USER",
          message: error.message,
        },
      });

      return;
    }

    if (error instanceof UserPlanNotFoundError) {
      res.status(404).json({
        error: {
          code: "USER_PLAN_NOT_FOUND",
          message: error.message,
        },
      });

      return;
    }

    next(error);
  }
});

// GET /api/users
userRouter.get("/", async (_req, res, next) => {
  try {
    const accountId = res.locals.accountId as string;

    const result = await listUsers(accountId);

    res.status(200).json({
      users: result,
    });
  } catch (error) {
    next(error);
  }
});

const changeUserPlanSchema = z.object({
  planId: z.uuid(),
}).strict();

userRouter.patch("/:id/plan", async (req, res, next) => {
  const userId = z.uuid().safeParse(req.params.id);
  const body = changeUserPlanSchema.safeParse(req.body);

  if (!userId.success || !body.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid user ID or plan ID.",
      },
    });
    return;
  }

  try {
    const accountId = res.locals.accountId as string;

    const result = await changeUserPlan(
      accountId,
      userId.data,
      body.data.planId
    );

    res.json({ user: result });
  } catch (error) {
    if (error instanceof PlanNotFoundError) {
      res.status(404).json({
        error: {
          code: "USER_OR_PLAN_NOT_FOUND",
          message: "User or plan not found or unavailable.",
        },
      });
      return;
    }

    next(error);
  }
});