/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    optimizePackageImports: ["recharts", "@remixicon/react", "@tanstack/react-table"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(process.env.ENABLE_HSTS === "true"
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
            : []),
        ],
      },
    ];
  },
  // Production: /api/* is proxied to BACKEND_URL at runtime by ./proxy.js,
  // not by Next.js rewrites (rewrites are evaluated at `next build` time and
  // would bake BACKEND_URL into the routes manifest, breaking any release
  // whose backend Service hostname differs from the build-time value).
  // Dev: keep rewrites so `npm run dev` (next dev -p 3100) still proxies /api
  // through to the backend on localhost:8000.
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
