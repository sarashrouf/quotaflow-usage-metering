import { Router } from "express";
import { z } from "zod";

import { requireAccountAuth } from "../middleware/account-auth.middleware";

import {
  createCustomPlan,
  listAvailablePlans,
  updateCustomPlan,
  PlanNotFoundError,
  PlanCodeConflictError,
} from "../services/plan.service";

export const planRouter = Router();

planRouter.use(requireAccountAuth);

const planLimitsSchema = {
  monthlyAllowance: z.number().int().positive().max(1_000_000_000),
  maxPerRequest: z.number().int().positive().max(1_000_000_000),
};

const createPlanSchema = z.object({
  code: z.string().trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .min(3).max(80),

  name: z.string().trim().min(2).max(100),

  type: z.enum(["account", "user"]),

  ...planLimitsSchema,
}).strict();

const updatePlanSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),

  monthlyAllowance:
    planLimitsSchema.monthlyAllowance.optional(),

  maxPerRequest:
    planLimitsSchema.maxPerRequest.optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required."
);

const planIdSchema = z.uuid();

// GET /api/plans
planRouter.get("/", async (_req, res, next) => {
  try {
    const accountId = res.locals.accountId as string;
    const result = await listAvailablePlans(accountId);

    res.json({ plans: result });
  } catch (error) {
    next(error);
  }
});

// POST /api/plans
planRouter.post("/", async (req, res, next) => {
  const parsed = createPlanSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: parsed.error.issues,
      },
    });
    return;
  }

  try {
    const accountId = res.locals.accountId as string;
    const plan = await createCustomPlan(
      accountId,
      parsed.data
    );

    res.status(201).json({ plan });
  } catch (error) {
    if (error instanceof PlanCodeConflictError) {
      res.status(409).json({
        error: {
          code: "PLAN_CODE_CONFLICT",
          message: error.message,
        },
      });
      return;
    }

    next(error);
  }
});

// PATCH /api/plans/:id
planRouter.patch("/:id", async (req, res, next) => {
  const id = planIdSchema.safeParse(req.params.id);
  const body = updatePlanSchema.safeParse(req.body);

  if (!id.success || !body.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid plan ID or update data.",
      },
    });
    return;
  }

  try {
    const accountId = res.locals.accountId as string;

    const plan = await updateCustomPlan(
      accountId,
      id.data,
      body.data
    );

    res.json({ plan });
  } catch (error) {
    if (error instanceof PlanNotFoundError) {
      res.status(404).json({
        error: {
          code: "PLAN_NOT_FOUND",
          message: error.message,
        },
      });
      return;
    }

    next(error);
  }
});