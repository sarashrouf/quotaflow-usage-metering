import { eq } from "drizzle-orm";

import { db } from "../db/connection";

import {
  accounts,
  plans,
  accountPlanAssignments,
} from "../db/schema";

import {
  changeAccountPlan,
  PlanNotFoundError,
} from "../services/plan.service";

import { requireAccountAuth } from "../middleware/account-auth.middleware";
import { Router } from "express";
import { z } from "zod";

import { requireAdminKey } from "../middleware/admin-auth.middleware";

import {
  createAccount,
  AccountPlanNotFoundError,
} from "../services/account.service";

export const accountRouter = Router();

const createAccountSchema = z.object({
  name: z.string().trim().min(2).max(100),

  planCode: z.enum([
    "account-starter",
    "account-pro",
  ]),
}).strict();

accountRouter.post(
  "/",
  requireAdminKey,
  async (req, res) => {
    const validation = createAccountSchema.safeParse(
      req.body
    );

    if (!validation.success) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid account data.",
          details: validation.error.issues,
        },
      });

      return;
    }

    try {
      const result = await createAccount(
        validation.data
      );

      res.status(201).json(result);
    } catch (error) {
      if (error instanceof AccountPlanNotFoundError) {
        res.status(404).json({
          error: {
            code: "ACCOUNT_PLAN_NOT_FOUND",
            message: error.message,
          },
        });

        return;
      }

      console.error("Account creation failed:", error);

      res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create account.",
        },
      });
    }
  }
);
accountRouter.get(
  "/me",
  requireAccountAuth,
  async (_req, res, next) => {
    try {
      const accountId = res.locals.accountId as string;

      const [result] = await db
        .select({
          id: accounts.id,
          name: accounts.name,
          plan: plans.name,
          monthlyAllowance: plans.monthlyAllowance,
          maxPerRequest: plans.maxPerRequest,
        })
        .from(accounts)
        .innerJoin(
          accountPlanAssignments,
          eq(accountPlanAssignments.accountId, accounts.id)
        )
        .innerJoin(
          plans,
          eq(plans.id, accountPlanAssignments.planId)
        )
        .where(eq(accounts.id, accountId));

      if (!result) {
        res.status(404).json({
          error: {
            code: "ACCOUNT_NOT_FOUND",
            message: "Account not found.",
          },
        });

        return;
      }

      res.status(200).json({
        account: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

const accountPlanSchema = z.object({
  planId: z.uuid(),
}).strict();

accountRouter.patch(
  "/me/plan",
  requireAccountAuth,
  async (req, res, next) => {
    const parsed = accountPlanSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid plan ID.",
        },
      });
      return;
    }

    try {
      const accountId = res.locals.accountId as string;

      const result = await changeAccountPlan(
        accountId,
        parsed.data.planId
      );

      res.json(result);
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
  }
);