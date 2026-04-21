import { redirect } from "next/navigation"
import { siteConfig } from "./siteConfig"

export default function Home() {
  redirect(siteConfig.baseLinks.clusters)
}
