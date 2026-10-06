import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/acceptance/**/*.test.ts"],
    fileParallelism: false,
  },
});
