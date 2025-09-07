import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: process.env.NEXT_PUBLIC_API_PROXY || "http://localhost:4000/:path*",
      },
    ];
  },
};

export default nextConfig;
