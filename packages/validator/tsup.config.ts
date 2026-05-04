import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm", "cjs"],
  dts: { entry: { index: "src/index.ts" } },
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  target: "es2022",
  external: ["@openlarm/core"],
  banner: ({ format }) =>
    format === "esm" ? { js: "#!/usr/bin/env node" } : {},
  onSuccess: "chmod +x dist/cli.js 2>/dev/null || true",
})
