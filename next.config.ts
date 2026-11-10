import type { NextConfig } from "next";

// In development the FastAPI server runs on port 8000; on Vercel, /api/* is served by api/index.py.
const nextConfig: NextConfig = {
  devIndicators: false,
  rewrites: async () => [
    {
      source: "/api/py/:path*",
      destination:
        process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000/api/py/:path*" : "/api/",
    },
  ],
};

export default nextConfig;
