import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      AUTH_ACCESS_TOKEN_SECRET: "integration-test-access-secret-is-at-least-32-characters",
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@127.0.0.1:1/learnpath_unit_tests",
    },
    coverage: {
      include: ["src/**/*.ts"],
      reporter: ["text", "html"],
    },
    environment: "node",
  },
});
