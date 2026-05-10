import type { Metadata } from "next"
import { ThemeProvider } from "next-themes"
import { Inter } from "next/font/google"
import "./globals.css"
import { siteConfig } from "./siteConfig"

import { AuthProvider } from "@/components/AuthProvider"
import { Sidebar } from "@/components/ui/navigation/Sidebar"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
})

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
        className={`${inter.className} overflow-y-scroll scroll-auto antialiased selection:bg-indigo-100 selection:text-indigo-700 dark:bg-gray-950`}
        suppressHydrationWarning
      >
        <div className="mx-auto max-w-screen-2xl">
          <ThemeProvider defaultTheme="system" attribute="class">
            <AuthProvider>
              <Sidebar />
              <main className="lg:pl-72">{children}</main>
            </AuthProvider>
          </ThemeProvider>
        </div>
      </body>
    </html>
  )
}
