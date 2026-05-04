import type { NextConfig } from "next";

// instrumentation.ts is supported natively in Next.js 16+ (no flag needed).
const nextConfig: NextConfig = {
  transpilePackages: ["@openlarm/core", "@openlarm/regions-taiwan", "@openlarm/ingest-builder"],
  async redirects() {
    return [
      {
        source: "/quote",
        destination: "https://quote.drone168.com",
        permanent: true,
      },
      {
        source: "/quote/:path*",
        destination: "https://quote.drone168.com/:path*",
        permanent: true,
      },
    ]
  },
};

export default nextConfig;
