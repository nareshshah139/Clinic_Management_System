import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@cms/shared-types"],
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
  experimental: {
    optimizeCss: false,
    externalDir: true,
  },
  webpack: (config, { isServer }) => {
    // Fix for pagedjs and es5-ext module resolution issues
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    
    // Add module resolution paths to look in parent node_modules
    config.resolve.modules = [
      ...(config.resolve.modules || []),
      'node_modules',
      path.resolve(__dirname, '../node_modules'),
    ];
    
    // Add explicit alias for es5-ext problematic paths
    config.resolve.alias = {
      ...config.resolve.alias,
      'es5-ext': path.resolve(__dirname, '../node_modules/es5-ext'),
    };
    
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: process.env.NEXT_PUBLIC_API_PROXY
          ? process.env.NEXT_PUBLIC_API_PROXY.replace(/\/+$/, '') + "/:path*"
          : "http://localhost:4000/:path*",
      },
      {
        source: "/uploads/:path*",
        destination: process.env.NEXT_PUBLIC_API_PROXY
          ? process.env.NEXT_PUBLIC_API_PROXY.replace(/\/+$/, '') + "/uploads/:path*"
          : "http://localhost:4000/uploads/:path*",
      },
    ];
  },
};

export default nextConfig;
