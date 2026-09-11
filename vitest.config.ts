import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: [
      "shared/**/*.test.ts",
      "worker/**/*.test.ts",
      "client/src/**/*.test.ts",
    ],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["shared/**", "worker/**", "client/src/**"],
    },
  },
});
