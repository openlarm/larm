import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Exclude acceptance tests from the default run. They require a live
    // DATABASE_URL and a deployed Railway worker. Run them explicitly with:
    //   DATABASE_URL=... FRONTEND_URL=... npx vitest run apps/ingest-worker/test/acceptance/
    exclude: ["**/node_modules/**", "**/test/acceptance/**"],
  },
})
