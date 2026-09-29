import { defineConfig } from "vitest/config";

// Isolated per file (vitest's default) because the wrapper tests mock
// sandcastle's `run`; forks keep one file's mock from leaking into another.
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    pool: "forks",
  },
});
