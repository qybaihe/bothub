import { defineConfig } from "vitest/config"
import { rendererAlias } from "./vite.shared.mts"

// Unit tests cover pure logic only (no Electron, no DOM).
export default defineConfig({
  resolve: { alias: rendererAlias },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node"
  }
})
