import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    env: {
      CWA_API_KEY: "test-key",
    },
  },
})
