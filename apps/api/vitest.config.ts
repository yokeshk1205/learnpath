import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      AUTH_ACCESS_TOKEN_SECRET: "integration-test-access-secret-is-at-least-32-characters",
      NODE_ENV: "test",
    },
    coverage: {
      include: ["src/**/*.ts"],
      reporter: ["text", "html"],
    },
    environment: "node",
  },
});
