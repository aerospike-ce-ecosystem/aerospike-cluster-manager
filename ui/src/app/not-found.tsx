import { Button } from "@/components/Button"
import { ArrowAnimated } from "@/components/ui/icons/ArrowAnimated"
import Image from "next/image"
import Link from "next/link"
import { siteConfig } from "./siteConfig"

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[#FFFDF5] px-6 dark:bg-[#0B1F33]">
      <Link
        href={siteConfig.baseLinks.home}
        className="rounded-2xl border border-[#FFC72C]/60 bg-white px-6 py-4 shadow-sm transition hover:border-[#FFC72C] focus:ring-2 focus:ring-[#FFC72C] focus:ring-offset-2 focus:outline-none dark:ring-offset-[#0B1F33]"
      >
        <Image
          src="/acm-logo.svg"
          alt="ACKO"
          width={200}
          height={64}
          className="h-10 w-auto"
        />
      </Link>
      <p className="mt-8 text-4xl font-semibold text-[#0B1F33] sm:text-5xl dark:text-[#FFC72C]">
        404
      </p>
      <h1 className="mt-4 text-2xl font-semibold text-gray-900 dark:text-gray-50">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Sorry, we couldn’t find the page you’re looking for.
      </p>
      <Button asChild className="group mt-8" variant="light">
        <Link href={siteConfig.baseLinks.home}>
          Go to the home page
          <ArrowAnimated
            className="stroke-gray-900 dark:stroke-gray-50"
            aria-hidden="true"
          />
        </Link>
      </Button>
    </div>
  )
}
