import "dotenv/config";
import { z } from "zod";

// Validate application configuration at startup.
const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  DATABASE_URL: z.string().min(1),

  ADMIN_SETUP_KEY: z.string().min(32),
});

export const env = envSchema.parse(process.env);