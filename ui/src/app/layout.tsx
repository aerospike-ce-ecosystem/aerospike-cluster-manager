import type { Metadata } from "next"
import { ThemeProvider } from "next-themes"
import "./globals.css"
import { siteConfig } from "./siteConfig"

import { AuthProvider } from "@/components/AuthProvider"
import { CopilotProvider } from "@/components/copilot/CopilotProvider"
import { ShellStatusBar } from "@/components/ui/navigation/ShellStatusBar"
import { Sidebar } from "@/components/ui/navigation/Sidebar"

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://aerospike-ce-ecosystem.github.io/aerospike-cluster-manager"

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: siteConfig.name,
  description: siteConfig.description,
  keywords: [
    "aerospike",
    "aerospike ce",
    "cluster manager",
    "kubernetes",
    "nosql",
  ],
  authors: [
    {
      name: "Aerospike CE Ecosystem",
      url: "https://github.com/aerospike-ce-ecosystem",
    },
  ],
  creator: "Aerospike CE Ecosystem",
  icons: {
    icon: [
      { url: "/acm-icon.svg", type: "image/svg+xml" },
      { url: "/acm-icon.png", type: "image/png", sizes: "1024x1024" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/acm-icon.png", type: "image/png", sizes: "1024x1024" }],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    title: siteConfig.name,
    description: siteConfig.description,
    siteName: siteConfig.name,
    images: [
      {
        url: "/acm-social-preview.png",
        width: 1280,
        height: 640,
        alt: "ACKO Aerospike Cluster Manager",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    images: ["/acm-social-preview.png"],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        data-app="ace"
        className="selection:bg-primary-95 selection:text-primary-40 dark:bg-bg antialiased"
      >
        <ThemeProvider defaultTheme="light" attribute="data-theme">
          <AuthProvider>
            <CopilotProvider>
              <Sidebar />
              <main className="acm-main">{children}</main>
              <ShellStatusBar />
            </CopilotProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
