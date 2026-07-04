import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions are enabled by default in Next 15; keep body limit generous for CSV import.
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
