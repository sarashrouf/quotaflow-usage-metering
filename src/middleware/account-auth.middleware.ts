import type {
  Request,
  Response,
  NextFunction,
} from "express";

import { eq } from "drizzle-orm";

import { db } from "../db/connection";
import { accounts } from "../db/schema";
import { hashApiKey } from "../utils/api-key";

export async function requireAccountAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.header("X-API-Key");

  // Reject requests without an API key.
  if (!apiKey) {
    res.status(401).json({
      error: {
        code: "MISSING_API_KEY",
        message: "API key is required.",
      },
    });

    return;
  }

  // Check the expected key format.
  if (!/^um_[a-f0-9]{64}$/.test(apiKey)) {
    res.status(401).json({
      error: {
        code: "INVALID_API_KEY",
        message: "Invalid API key.",
      },
    });

    return;
  }

  try {
    // Never search using or store the plaintext key.
    const keyHash = hashApiKey(apiKey);

    const [account] = await db
      .select({
        id: accounts.id,
        name: accounts.name,
      })
      .from(accounts)
      .where(eq(accounts.apiKeyHash, keyHash))
      .limit(1);

    if (!account) {
      res.status(401).json({
        error: {
          code: "INVALID_API_KEY",
          message: "Invalid API key.",
        },
      });

      return;
    }

    // Pass the authenticated account identity to the route.
    res.locals.accountId = account.id;

    next();
  } catch (error) {
    next(error);
  }
}