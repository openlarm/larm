import type { NextConfig } from "next";

// instrumentation.ts is supported natively in Next.js 16+ (no flag needed).
const nextConfig: NextConfig = {
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
