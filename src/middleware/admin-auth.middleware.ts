import type {
  Request,
  Response,
  NextFunction,
} from "express";

import { env } from "../config/env";
import { secureCompare } from "../utils/api-key";

export function requireAdminKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const providedKey = req.header("X-Admin-Key");

  if (!providedKey) {
    res.status(401).json({
      error: {
        code: "MISSING_ADMIN_KEY",
        message: "Admin setup key is required.",
      },
    });

    return;
  }

  const isValid = secureCompare(
    providedKey,
    env.ADMIN_SETUP_KEY
  );

  if (!isValid) {
    res.status(401).json({
      error: {
        code: "INVALID_ADMIN_KEY",
        message: "Invalid admin setup key.",
      },
    });

    return;
  }

  next();
}