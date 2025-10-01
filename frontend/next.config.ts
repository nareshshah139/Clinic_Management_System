import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Warning: This allows production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: false,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: process.env.NEXT_PUBLIC_API_PROXY || "http://localhost:4000/:path*",
      },
      {
        source: "/uploads/:path*",
        destination: process.env.NEXT_PUBLIC_API_PROXY
          ? process.env.NEXT_PUBLIC_API_PROXY.replace(/:\d+\/$/, '/').replace(/\/$/, '') + "/uploads/:path*"
          : "http://localhost:4000/uploads/:path*",
      },
    ];
  },
};

export default nextConfig;
