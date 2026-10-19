import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/frontend/**",
    ],
    fileParallelism: false,
    maxWorkers: 1,
  },
});