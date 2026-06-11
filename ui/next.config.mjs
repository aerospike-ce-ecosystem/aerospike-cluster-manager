import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // @copilotkit/react-core/v2 imports its own stylesheet, which is compiled
  // with Tailwind v4 (native CSS cascade layers) and fails this app's
  // Tailwind v3 PostCSS pipeline. Substitute an empty file at bundle time;
  // the real stylesheet is served statically from /copilot/copilot-styles.css
  // (see ui/scripts/copy-copilot-css.mjs) and loaded only when the copilot
  // is enabled.
  webpack: (config, { webpack }) => {
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /@copilotkit[\\/]react-core[\\/]dist[\\/]v2[\\/]index\.css$/,
        path.join(projectRoot, "src/lib/copilot/empty.css"),
      ),
    )
    return config
  },
  experimental: {
    optimizePackageImports: [
      "recharts",
      "@remixicon/react",
      "@tanstack/react-table",
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          ...(process.env.ENABLE_HSTS === "true"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ]
  },
  // Production: /api/* is proxied to API_URL at runtime by ./proxy.js,
  // not by Next.js rewrites (rewrites are evaluated at `next build` time and
  // would bake API_URL into the routes manifest, breaking any release whose
  // API Service hostname differs from the build-time value).
  // Dev: keep rewrites so `npm run dev` (next dev -p 3100) still proxies /api
  // through to the API on localhost:8000.
  async rewrites() {
    if (process.env.NODE_ENV === "production") return []
    const apiUrl = process.env.API_URL ?? "http://localhost:8000"
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }]
  },
}

export default nextConfig
