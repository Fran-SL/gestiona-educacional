import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { environment: "node", include: ["tests/integration/**/*.test.ts"], testTimeout: 20000, hookTimeout: 30000, fileParallelism: false },
});
