import nextra from "nextra"

const withNextra = nextra({
  theme: "nextra-theme-docs",
  themeConfig: "./theme.config.tsx",
})

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Nextra site is decoupled from the frontend app; Next 14 is enough here.
  // If we ever need to consume @openlarm/core types directly, add the
  // packages to transpilePackages:
  // transpilePackages: ["@openlarm/core", "@openlarm/regions-taiwan"],
}

export default withNextra(nextConfig)
