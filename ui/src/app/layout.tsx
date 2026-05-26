import type { Metadata } from "next"
import { ThemeProvider } from "next-themes"
import "./globals.css"
import { siteConfig } from "./siteConfig"

import { AuthProvider } from "@/components/AuthProvider"
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
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    title: siteConfig.name,
    description: siteConfig.description,
    siteName: siteConfig.name,
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
        className="antialiased selection:bg-primary-95 selection:text-primary-40 dark:bg-bg"
        suppressHydrationWarning
      >
        <ThemeProvider defaultTheme="light" attribute="data-theme">
          <AuthProvider>
            <Sidebar />
            <main className="acm-main">{children}</main>
            <ShellStatusBar />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
