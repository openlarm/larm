import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enable instrumentation.ts to run at server start.
    // Used to configure HTTPS_PROXY for outgoing fetch() calls.
    instrumentationHook: true,
  },
};

export default nextConfig;
